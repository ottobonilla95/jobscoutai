import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {Accounts} from '../packages/core/src/accounts';
import {Database,createDatabase,type Connection} from '../packages/core/src/database';
import {Store} from '../packages/core/src/store';
import {profileSchema,type Profile} from '../packages/core/src/profile';
import {parseBoard} from '../packages/core/src/source-settings';
import {searchCompanyBoard,describeJob} from '../packages/core/src/sources';
import {rankJob} from '../packages/core/src/ranker';
import {verifyListing} from '../packages/core/src/verification';
import {runSearch} from '../packages/core/src/worker';
import {opportunitiesForView} from '../packages/core/src/opportunity-selection';

const args=process.argv.slice(2);
const option=(name:string)=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const boardUrl=option('--board'),title=option('--title');
const userId=args.includes('--user')?option('--user'):null;
const profilePath=args.includes('--profile-json')?option('--profile-json'):null;
if(!boardUrl||!parseBoard(boardUrl)||!title||Boolean(userId)===Boolean(profilePath)){
 throw new Error('Use --board <Ashby/Greenhouse board> --title <exact title> and either --user <account ID> or --profile-json <file>.');
}

async function sourceProfile():Promise<Profile>{
 if(profilePath)return profileSchema.parse(JSON.parse(await readFile(profilePath,'utf8')));
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is needed only to read the account profile.');
 const production=createDatabase(process.env.DATABASE_URL);
 try{return (await new Store(production,userId!).profile()).profile;}
 finally{await production.close();}
}

async function isolatedStore(){
 const pg=new PGlite();
 const migrations=(await readdir(new URL('../migrations/',import.meta.url))).filter(file=>/^\d+_.*\.sql$/.test(file)).sort();
 for(const file of migrations)await pg.exec(await readFile(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
 const db=new Database(pg as Connection,fn=>pg.transaction(async tx=>{
  const nested=new Database(tx as Connection,f=>f(nested),async()=>{});return fn(nested);
 }),()=>pg.close());
 const accounts=new Accounts(db);
 const id=await accounts.signup({email:'local-rehearsal@example.test',password:'Local rehearsal password 2026'});
 return {db,store:await accounts.store(id.id)};
}

const profile=await sourceProfile();
const {db,store}=await isolatedStore();
try{
 await store.saveProfile({...profile,onboardingCompleted:true,enabled:true,sources:['companies'],companyBoards:[boardUrl],discoveredCompanyBoards:[],titles:[title],researchEnabled:false,emailEnabled:false,emailAlertsRequested:false,maxJobsPerRun:1,dailyEvaluationLimit:1,postedWithinDays:0});
 const result=await runSearch({store,force:true,canNotify:false,dependencies:{
  search:async (current,session)=>{
   const jobs=(await searchCompanyBoard(boardUrl,current,session)).filter(job=>job.title===title);
   return {jobs,errors:[],blocked:[],succeeded:1};
  },describe:describeJob,rank:(job,current)=>rankJob(job,current),verify:verifyListing,notify:async()=>0,
 }});
 if(!('discovered' in result))throw new Error('The isolated worker did not start.');
 const current=await store.profile(),jobs=await store.jobs(),feed=opportunitiesForView(jobs,current.profile,current.version,'all');
 console.log(JSON.stringify({status:result.status,discovered:result.discovered,evaluated:result.evaluated,ready:feed.length,jobs:jobs.map(job=>({title:job.title,company:job.company,score:job.assessment?.score??null,decision:job.assessment?.evaluation?.decision??null,eligibility:job.assessment?.eligibility??null,verification:job.verification?.status??null,applicationUrl:job.verification?.applicationUrl??null})),error:(await store.runs())[0]?.error??null}));
 if(result.status!=='completed'||feed.length!==1)process.exitCode=1;
}finally{await db.close();}
