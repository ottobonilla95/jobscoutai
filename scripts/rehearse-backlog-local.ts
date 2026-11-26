import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {Accounts} from '../packages/core/src/accounts';
import {Database,createDatabase,type Connection} from '../packages/core/src/database';
import {Store} from '../packages/core/src/store';
import {discoveryScope} from '../packages/core/src/discovery-state';
import {searchSources,describeJob} from '../packages/core/src/sources';
import {rankJob} from '../packages/core/src/ranker';
import {verifyListing} from '../packages/core/src/verification';
import {runSearch} from '../packages/core/src/worker';
import {opportunitiesForView} from '../packages/core/src/opportunity-selection';

const userId=process.argv[2];
if(!userId||!process.env.DATABASE_URL)throw new Error('Use npm run rehearse:backlog -- <account-id> with DATABASE_URL configured.');

async function isolatedStore(){
 const pg=new PGlite();
 const migrations=(await readdir(new URL('../migrations/',import.meta.url))).filter(file=>/^\d+_.*\.sql$/.test(file)).sort();
 for(const file of migrations)await pg.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 const db=new Database(pg as Connection,fn=>pg.transaction(async tx=>{
  const nested=new Database(tx as Connection,f=>f(nested),async()=>{});return fn(nested);
 }),()=>pg.close());
 const accounts=new Accounts(db),account=await accounts.signup({email:'backlog-rehearsal@example.test',password:'Local rehearsal password 2026'});
 return {db,store:await accounts.store(account.id)};
}

const production=createDatabase(process.env.DATABASE_URL);
const snapshot=await (async()=>{
 try{return await production.transaction(async db=>{
  await db.exec('SET TRANSACTION READ ONLY');
  const source=new Store(db,userId);
  const {profile}=await source.profile();
  const history=await source.discoveryState(discoveryScope(profile));
  const jobs=await source.jobs();
  const dedup=await db.prepare('SELECT job_id,url_hash,identity_hash,reason,retry_after,expires_at FROM job_dedup WHERE user_id=? AND expires_at>?').all(userId,new Date().toISOString());
  return {profile,history,jobs,dedup};
 });}finally{await production.close();}
})();
const {profile,history,jobs,dedup}=snapshot;

const {db,store}=await isolatedStore();
try{
 await store.saveProfile({...profile,researchEnabled:false,emailEnabled:false,emailAlertsRequested:false,maxJobsPerRun:3,dailyEvaluationLimit:3});
 let {profile:localProfile,version}=await store.profile();
 await store.saveDiscoveryState(discoveryScope(localProfile),history,version);
 localProfile=(await store.profile()).profile;
 for(const job of jobs){
  await store.upsert({id:job.id,sourceKey:job.sourceKey,title:job.title,company:job.company,location:job.location,url:job.url,postedAt:job.postedAt,description:job.description});
  if(job.assessment&&job.evaluatedVersion!==null)await db.prepare('UPDATE jobs SET assessment=?,score=?,evaluated_version=? WHERE user_id=? AND id=?').run(JSON.stringify(job.assessment),job.assessment.score,version,store.userId,job.id);
  if(job.verification)await store.verify(job.id,job.verification);
  if(job.status!=='new')await store.setStatus(job.id,job.status);
  if(job.tracking)await store.track(job.id,job.tracking);
 }
 for(const row of dedup)await db.prepare('INSERT INTO job_dedup(user_id,job_id,profile_version,url_hash,identity_hash,reason,retry_after,expires_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,job_id) DO NOTHING').run(store.userId,row.job_id,version,row.url_hash,row.identity_hash,row.reason,row.retry_after,row.expires_at);
 const seeded=await store.jobs(),before=opportunitiesForView(seeded,localProfile,version,'all').map(job=>job.id),assessedBefore=new Set(seeded.filter(job=>job.assessment).map(job=>job.id));
 if(process.argv.includes('--snapshot-only')){
  console.log(JSON.stringify({mode:'snapshot_only',jobs:seeded.length,pending:(await store.pending(version,30,localProfile)).length,discoveredBoards:localProfile.discoveredCompanyBoards.length,discarded:dedup.length,ready:before.length}));
 }else{
 const ranked:Array<{title:string;company:string;score:number;decision:string|null;eligibility:string}>=[];
 const result=await runSearch({store,force:true,canNotify:false,dependencies:{search:(current,session)=>searchSources(current,undefined,session),describe:describeJob,rank:async(job,current)=>{const answer=await rankJob(job,current);ranked.push({title:job.title,company:job.company,score:answer.assessment.score,decision:answer.assessment.evaluation?.decision??null,eligibility:answer.assessment.eligibility});return answer;},verify:verifyListing,notify:async()=>0}});
 if(!('discovered' in result))throw new Error('The isolated worker did not start.');
 const latest=(await store.runs())[0],after=opportunitiesForView(await store.jobs(),localProfile,version,'all');
 const reviewed=(await store.jobs()).filter(job=>job.assessment&&!assessedBefore.has(job.id));
 console.log(JSON.stringify({mode:'backlog_classification',overrides:{researchEnabled:false,maxJobsPerRun:3,dailyEvaluationLimit:3},status:result.status,discovered:result.discovered,evaluated:result.evaluated,readyBefore:before.length,readyAfter:after.length,newReady:after.filter(job=>!before.includes(job.id)).map(job=>({title:job.title,company:job.company,applicationUrl:job.verification?.applicationUrl})),boardAttempts:latest.discovery?.rounds.flatMap(round=>round.attempts).map(a=>({source:a.source,status:a.status,found:a.found})),ranked,reviewed:reviewed.map(job=>({title:job.title,company:job.company,score:job.assessment?.score,decision:job.assessment?.evaluation?.decision,verification:job.verification?.status})),error:latest.error}));
 if(result.status==='failed')process.exitCode=1;
 }
}finally{await db.close();}
