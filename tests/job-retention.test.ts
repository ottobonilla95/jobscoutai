import test from 'node:test';
import assert from 'node:assert/strict';
import {accountsFixture,storeFixture} from './database-fixture';
import {Store} from '../packages/core/src/store';
import {defaultProfile,type Assessment,type JobListing} from '../packages/core/src/profile';
import {dedupLifetimeMs,pendingLifetimeMs,pendingLimit,pendingRetryMs,listingHashes} from '../packages/core/src/job-retention';
import {runSearch} from '../packages/core/src/worker';
import {evaluateStrategy} from '../packages/core/src/strategy';

const listing=(id:string,patch:Partial<JobListing>={}):JobListing=>({id,title:`Engineer ${id}`,company:`Employer ${id}`,location:'London',url:`https://example.test/jobs/${id}`,postedAt:null,description:'Build useful products with customers and own delivery of the software.',...patch});
const assessment:Assessment={score:90,eligibility:'eligible',summary:'Relevant product work.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null};
const weak={...assessment,score:30};
const stamp=(date:Date,offset:number)=>new Date(date.getTime()+offset).toISOString();
function ai(t:test.TestContext){const old=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='synthetic';t.after(()=>{if(old===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=old;});}

test('cleanup removes rejected full listings and their research, retaining qualified matches and promising research',async t=>{
  const store=await storeFixture(t),{profile,version}=await store.profile();
  for(const id of ['match','research','weak','ineligible','closed','duplicate','original','pending','stale'])await store.upsert(listing(id));
  for(const id of ['match','closed','duplicate','original'])await store.assess(id,assessment,version);
  await store.assess('weak',weak,version);await store.assess('ineligible',{...assessment,eligibility:'ineligible'},version);
  await store.assess('stale',weak,version-1);
  const strategy={...profile.strategy,requirements:[{id:'hours',label:'Hours',instruction:'Verify the advertised working hours.',unknown:'research' as const}]};
  const evaluation=evaluateStrategy(strategy,{components:[],requirements:[],countries:[]},listing('research').description!,'London');
  await store.assess('research',{...assessment,concerns:['What hours are required?'],evaluation},version);
  await store.verify('closed',{status:'closed',checkedAt:new Date().toISOString(),applicationUrl:null,note:'Closed'});
  await store.db.prepare('UPDATE jobs SET duplicate_of=? WHERE user_id=? AND id=?').run('original',store.userId,'duplicate');
  assert.ok((await store.job('weak'))?.research);
  const result=await store.cleanupJobs(version);
  assert.equal(result.rejected,4);assert.equal(result.pendingKept,2);
  assert.deepEqual((await store.jobs()).map(j=>j.id).sort(),['match','original','pending','research','stale']);
  const records=await store.db.prepare('SELECT * FROM job_dedup WHERE user_id=?').all(store.userId);
  assert.equal(records.length,4);assert.equal(records.find(r=>r.job_id==='weak')?.reason,'not_qualified');
  assert.equal('description' in records[0],false);assert.equal('assessment' in records[0],false);assert.equal('title' in records[0],false);
});

test('explicit saves, archives, tracking, feedback, research requests, duplicate reviews and delivery history survive cleanup',async t=>{
  const store=await storeFixture(t),{version}=await store.profile();
  const ids=['saved','archive','applied','note','manual','followup','feedback','requested','distinct','notified','delivery','weak'];
  for(const id of ids){await store.upsert(listing(id));await store.assess(id,weak,version);}
  await store.setStatus('saved','saved');await store.setStatus('archive','dismissed');
  const tracking={stage:'not_recorded' as const,recommendation:'automatic' as const,notes:'',nextAction:'',followUp:''};
  await store.track('applied',{...tracking,stage:'rejected'});await store.track('note',{...tracking,notes:'Keep this note'});
  await store.track('manual',{...tracking,recommendation:'research'});await store.track('followup',{...tracking,followUp:'2026-12-01'});
  await store.db.prepare('INSERT INTO opportunity_feedback(user_id,id,job_id,value,created_at) VALUES(?,?,?,?,?)').run(store.userId,'feedback-event','feedback','{}',new Date().toISOString());
  await store.requestResearch('requested');await store.markDistinct('distinct');
  await store.db.prepare('UPDATE jobs SET notified_at=? WHERE user_id=? AND id=?').run(new Date().toISOString(),store.userId,'notified');
  await store.enqueueDelivery('delivery-event',{},['delivery']);
  assert.equal((await store.cleanupJobs(version)).removed,1);
  assert.deepEqual((await store.jobs()).map(j=>j.id).sort(),ids.filter(id=>id!=='weak').sort());
});

test('unevaluated queue has a cap and first-seen expiry; overflow is retryable rather than labelled rejected',async t=>{
  const store=await storeFixture(t),{profile,version}=await store.profile(),now=new Date();
  for(let i=0;i<25;i++)await store.upsert(listing(String(i)));
  await store.db.prepare('UPDATE jobs SET first_seen=? WHERE user_id=? AND id=?').run(stamp(now,-pendingLifetimeMs-1),store.userId,'0');
  const result=await store.cleanupJobs(version,now);
  assert.equal(result.pendingKept,pendingLimit(profile));assert.equal(result.pendingRemoved,5);assert.equal(result.rejected,0);
  assert.equal((await store.jobs()).length,20);
  const expired=await store.db.prepare('SELECT * FROM job_dedup WHERE user_id=? AND job_id=?').get(store.userId,'0');
  assert.equal(expired.reason,'pending_expired');assert.equal(expired.retry_after,stamp(now,pendingRetryMs));
  assert.equal(await store.upsert(listing('0')),false);
  await store.db.prepare('UPDATE job_dedup SET retry_after=? WHERE user_id=? AND job_id=?').run(stamp(now,-1),store.userId,'0');
  assert.equal(await store.upsert(listing('0')),true);
});

test('discarded identities deduplicate IDs, URLs and named-employer signatures until expiry or matching preferences change',async t=>{
  const store=await storeFixture(t),{profile,version}=await store.profile(),job=listing('reject');
  await store.upsert(job);await store.assess(job.id,weak,version);await store.cleanupJobs(version);
  assert.equal(await store.upsert(job),false);
  assert.equal(await store.upsert({...job,id:'other-id',company:'Alias',url:job.url+'?utm_source=feed#top'}),false);
  assert.equal(await store.upsert({...job,id:'other-source',url:'https://other.test/vacancy',sourceKey:'yc'}),false);
  await store.saveProfile({...profile,intervalHours:12});assert.equal((await store.profile()).version,version);assert.equal(await store.upsert(job),false);
  await store.saveProfile({...profile,minimumScore:20});assert.equal((await store.profile()).version,version+1);assert.equal(await store.upsert(job),true);
  await store.assess(job.id,{...weak,score:5},version+1);const future=new Date(Date.now()-dedupLifetimeMs-1000);await store.cleanupJobs(version+1,future);
  assert.equal(await store.upsert(job),true);
  const anonymous=listing('anonymous',{company:'Employer not disclosed'});
  await store.upsert(anonymous);await store.assess(anonymous.id,weak,version+1);await store.cleanupJobs(version+1);
  assert.equal(listingHashes(anonymous).identityHash,null);
  assert.equal(await store.upsert({...anonymous,id:'different-anonymous',url:'https://other.test/unrelated'}),true);
});

test('cleanup and deduplication are account-scoped and stale-profile cleanup cannot delete jobs',async t=>{
  const accounts=await accountsFixture(t),a=await accounts.signup({email:'a@test.test',password:'A private test password 2026'}),b=await accounts.signup({email:'b@test.test',password:'A private test password 2026'});
  const store=await accounts.store(a.id),other=await accounts.store(b.id);
  await store.upsert(listing('same'));await other.upsert(listing('same'));await store.assess('same',weak,1);
  await store.saveProfile({...defaultProfile,objective:'Find a predictable part time engineering role.'});
  assert.equal((await store.cleanupJobs(1)).skipped,true);assert.ok(await store.job('same'));
  await store.assess('same',weak,2);await store.cleanupJobs(2);
  assert.equal(await store.job('same'),null);assert.ok(await other.job('same'));assert.equal(await other.upsert(listing('same')),true);
  assert.equal((await other.db.prepare('SELECT * FROM job_dedup WHERE user_id=?').all(other.userId)).length,0);
});

test('dedup insertion and full-listing deletion roll back together on database failure',async t=>{
  const store=await storeFixture(t);await store.upsert(listing('rollback'));await store.assess('rollback',weak,1);
  await assert.rejects(store.db.transaction(async db=>{
    const prepare=db.prepare.bind(db);
    db.prepare=(sql:string)=>{
      const statement=prepare(sql);
      if(sql.startsWith('DELETE FROM jobs'))statement.run=async()=>{throw new Error('injected deletion failure');};
      return statement;
    };
    await new Store(db,store.userId).cleanupJobs(1);
  }),/injected deletion failure/);
  assert.ok(await store.job('rollback'));
  assert.equal((await store.db.prepare('SELECT * FROM job_dedup WHERE user_id=?').all(store.userId)).length,0);
});

test('every completed or failed search cleans rejected jobs, bounds failed AI backlog and suppresses rediscovery',async t=>{
  ai(t);const store=await storeFixture(t);await store.saveProfile({...defaultProfile,cvText:'Experienced engineer building reliable software for customers. '.repeat(3)});
  const {version}=await store.profile();await store.upsert(listing('weak'));await store.assess('weak',weak,version);
  let calls=0;const dependencies={search:async()=>Array.from({length:40},(_,i)=>listing(String(i))),describe:async()=>listing('x').description!,rank:async()=>{calls++;throw new Error('provider down');},notify:async()=>0};
  const result=await runSearch({store,force:true,dependencies});assert.equal(result.status,'partial');assert.equal(calls,1);
  assert.equal(await store.job('weak'),null);assert.equal((await store.jobs()).length,20);
  await runSearch({store,force:true,dependencies});assert.equal((await store.jobs()).length,20);assert.equal(calls,2);
  await store.upsert(listing('another-weak'));await store.assess('another-weak',weak,version);
  const failed=await runSearch({store,force:true,dependencies:{...dependencies,search:async()=>{throw new Error('source down');}}});
  assert.equal(failed.status,'failed');assert.equal(await store.job('another-weak'),null);
  assert.equal((await store.db.prepare('SELECT * FROM locks WHERE user_id=?').all(store.userId)).length,0);
});

test('a cleanup failure is reported and still releases the search lease',async t=>{
  ai(t);const store=await storeFixture(t);await store.saveProfile({...defaultProfile,cvText:'Experienced engineer building reliable software for customers. '.repeat(3)});
  store.cleanupJobs=async()=>{throw new Error('database unavailable');};
  const result=await runSearch({store,force:true,dependencies:{search:async()=>[],describe:async()=>'',rank:async()=>({assessment,inputTokens:0,outputTokens:0}),notify:async()=>0}});
  assert.equal(result.status,'failed');assert.match((await store.runs())[0].error!,/cleanup could not finish/);
  assert.equal((await store.db.prepare('SELECT * FROM locks WHERE user_id=?').all(store.userId)).length,0);
});
