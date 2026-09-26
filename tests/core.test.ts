import {brand} from '../packages/core/src/brand';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../packages/core/src/store';
import { parseListings, parseDescription, SourceError } from '../packages/core/src/linkedin';
import { defaultProfile, type Assessment, type JobListing } from '../packages/core/src/profile';
import { verifyEvidence } from '../packages/core/src/ranker';
import { notifyMatches, type EmailPayload } from '../packages/core/src/notifications';
import { runSearch } from '../packages/core/src/worker';

const listing: JobListing = { id:'12345', title:'Founding Engineer', company:'Example', location:'Remote', url:'https://www.linkedin.com/jobs/view/12345/', postedAt:null };
const assessment: Assessment = { score:91, eligibility:'eligible', summary:'Strong overlap with the stated experience.', reasons:['Relevant product engineering experience'], concerns:['Confirm work authorization'], salaryEvidence:null, equityEvidence:'1% equity', founderPathEvidence:null };
function fixture(t: test.TestContext) {
  const dir=mkdtempSync(join(tmpdir(),`${brand.slug}-test-`)); const store=new Store(join(dir,'test.sqlite'));
  t.after(()=>{store.db.close();rmSync(dir,{recursive:true,force:true});});
  return {store,dir};
}
function configure(t: test.TestContext) {
  for (const [key,value] of Object.entries({ AI_GATEWAY_API_KEY:'test-key', RESEND_API_KEY:'test-key', EMAIL_FROM:'test@example.com' })) {
    const old=process.env[key]; process.env[key]=value;
    t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});
  }
}
test('LinkedIn parser canonicalizes and deduplicates jobs, rejecting other hosts',()=>{
  const card=(url:string)=>`<div class="base-card"><a class="base-card__full-link" href="${url}"></a><h3 class="base-search-card__title">Founding Engineer</h3><h4 class="base-search-card__subtitle">Example</h4><span class="job-search-card__location">Remote</span><time datetime="2026-09-23"></time></div>`;
  const jobs=parseListings(card('https://www.linkedin.com/jobs/view/role-12345?trackingId=x')+card('https://www.linkedin.com/jobs/view/12345/')+card('https://evil.example/jobs/view/67890/'));
  assert.equal(jobs.length,1); assert.equal(jobs[0].id,'12345'); assert.equal(jobs[0].url,listing.url); assert.equal(jobs[0].postedAt,'2026-09-23');
});
test('description extraction excludes executable content and rejects missing descriptions',()=>{
  const text=parseDescription('<div class="show-more-less-html__markup"><p>Build useful products with our founding team and take ownership of technical delivery.</p><p>1% equity</p><script>stealCredentials()</script></div>');
  assert.match(text,/1% equity/); assert.doesNotMatch(text,/stealCredentials/);
  assert.throws(()=>parseDescription('<html>Sign in</html>'),/usable description/);
});
test('unsupported compensation evidence is removed and ineligible scores capped',()=>{
  const result=verifyEvidence({...assessment,eligibility:'ineligible',salaryEvidence:'$250,000',founderPathEvidence:'Become a cofounder'},'We offer 1% equity and ownership of product development.');
  assert.equal(result.equityEvidence,'1% equity');assert.equal(result.salaryEvidence,null);assert.equal(result.founderPathEvidence,null);assert.equal(result.score,39);
});
test('two database connections cannot overlap searches; paused manual requests still run',t=>{
  const {store,dir}=fixture(t);const other=new Store(join(dir,'test.sqlite'));t.after(()=>other.db.close());
  assert.equal(store.claim(),null);store.requestRun();const id=store.claim();assert.ok(id);assert.equal(other.claim(true),null);
  store.finish(id,'completed',{discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0},null);
  assert.equal(other.claim(),null);
});
test('23-hour interval is elapsed time and expired leases can recover',t=>{
  const {store}=fixture(t);store.saveProfile({...defaultProfile,intervalHours:23,enabled:true});
  const before=Date.now();const id=store.claim();assert.ok(id);
  const next=Date.parse(String(store.state().next_run));assert.ok(Math.abs(next-before-23*3600000)<1500);
  store.db.exec('UPDATE locks SET expires=0');assert.ok(store.claim(true));
  assert.equal(store.runs().find(r=>r.id===id)?.status,'failed');
});
test('preference changes trigger reevaluation; cadence and email changes do not',t=>{
  const {store}=fixture(t);const first=store.profile();
  store.saveProfile({...first.profile,intervalHours:3,email:'me@example.com'});assert.equal(store.profile().version,first.version);
  store.saveProfile({...store.profile().profile,equityExpectation:'At least 1%'});assert.equal(store.profile().version,first.version+1);
  store.saveProfile({...store.profile().profile,titles:['Technical Cofounder']});assert.equal(store.profile().version,first.version+2);
});
test('email retries use the same stored payload/key and successful sends never repeat',async t=>{
  configure(t);const {store}=fixture(t);const p={...defaultProfile,email:'me@example.com',emailEnabled:true};
  store.upsert(listing);store.assess(listing.id,assessment,1);
  const attempts:{payload:EmailPayload;id:string}[]=[];
  const sender=async(payload:EmailPayload,id:string)=>{attempts.push({payload,id});if(attempts.length===1)throw new Error('Network interrupted');};
  await assert.rejects(notifyMatches(store,p,1,sender),/Network interrupted/);
  assert.equal(await notifyMatches(store,p,1,sender),1);
  assert.deepEqual(attempts[0],attempts[1]);assert.equal(await notifyMatches(store,p,1,sender),0);assert.equal(attempts.length,2);assert.ok(store.jobs()[0].notifiedAt);
});
test('uncertain deliveries beyond the idempotency window are not resent',async t=>{
  configure(t);const {store}=fixture(t);const p={...defaultProfile,email:'me@example.com',emailEnabled:true};
  store.upsert(listing);store.assess(listing.id,assessment,1);
  await assert.rejects(notifyMatches(store,p,1,async()=>{throw new Error('Uncertain');}));
  store.db.prepare('UPDATE deliveries SET created_at=?').run(new Date(Date.now()-25*3600000).toISOString());
  let sent=0;await notifyMatches(store,p,1,async()=>{sent++;});assert.equal(sent,0);
  assert.equal(store.db.prepare('SELECT status FROM deliveries').get()!.status,'review');
});
test('search → persist → score → email completes, and repeat scans do not reevaluate or notify',async t=>{
  configure(t);const {store}=fixture(t);
  store.saveProfile({...defaultProfile,cvText:'Test candidate with product engineering and startup experience. '.repeat(5),email:'me@example.com',emailEnabled:true});
  let ranked=0;let sent=0;
  const dependencies={search:async()=>[listing],describe:async()=> 'Build products with the founding team. We offer 1% equity and full technical ownership.',
    rank:async()=>{ranked++;return {assessment,inputTokens:123,outputTokens:45};},
    notify:async(s:Store,p:typeof defaultProfile,v:number)=>notifyMatches(s,p,v,async()=>{sent++;})};
  const first=await runSearch({store,force:true,dependencies});assert.equal(first.status,'completed');assert.equal(store.jobs().length,1);assert.equal(sent,1);
  await runSearch({store,force:true,dependencies});assert.equal(ranked,1);assert.equal(sent,1);assert.equal(store.runs().length,2);
});
test('access throttling produces a failed run and no further description requests',async t=>{
  configure(t);const {store}=fixture(t);store.saveProfile({...defaultProfile,cvText:'Candidate experience. '.repeat(10)});store.upsert(listing);
  let fetched=0;
  const result=await runSearch({store,force:true,dependencies:{search:async()=>{throw new SourceError('HTTP 429: access limited',true);},describe:async()=>{fetched++;return '';},rank:async()=>({assessment,inputTokens:0,outputTokens:0}),notify:async()=>0}});
  assert.equal(result.status,'failed');assert.equal(fetched,0);assert.match(store.runs()[0].error!,/429/);
});
