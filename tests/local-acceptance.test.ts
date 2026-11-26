import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture} from './database-fixture';
import {defaultProfile,type JobListing} from '../packages/core/src/profile';
import {evaluateStrategy} from '../packages/core/src/strategy';
import {runSearch} from '../packages/core/src/worker';
import {verifyListing} from '../packages/core/src/verification';
import {opportunitiesForView} from '../packages/core/src/opportunity-selection';

const linkedInUrl='https://www.linkedin.com/jobs/view/4487984988/';
const employerUrl='https://jobs.ashbyhq.com/clickhouse/0087feaa-a275-427d-bf4a-14a508708687';
const applicationUrl=`${employerUrl}/application`;
const description=Array.from({length:110},(_,i)=>`feature${i} product customers TypeScript delivery`).join(' ');
const listing:JobListing={id:'4487984988',sourceKey:'linkedin',title:'Senior Product Engineer',company:'ClickHouse',location:'Rome, Italy',url:linkedInUrl,postedAt:new Date().toISOString(),description};
const employer:JobListing={...listing,id:'ashby:clickhouse:0087feaa-a275-427d-bf4a-14a508708687',sourceKey:'ashby:clickhouse',company:'clickhouse',location:'Germany · Italy · Remote',url:employerUrl};

async function rehearse(t:test.TestContext,employerDescription=description){
 const prior=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='local-fixture';
 t.after(()=>{if(prior===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=prior;});
 const store=await storeFixture(t);
 await store.saveProfile({...defaultProfile,cvText:'Experienced product engineer who owns customer-facing TypeScript products. '.repeat(3),titles:[listing.title],locations:['Italy'],sources:['linkedin'],researchEnabled:false,maxJobsPerRun:2,dailyEvaluationLimit:2});
 let ranked=0,boardReads=0;
 const result=await runSearch({store,force:true,dependencies:{
  search:async()=>[listing],describe:async()=>description,
  rank:async(job,profile)=>{
   ranked++;
   const raw={components:profile.strategy.groups.flatMap(group=>group.criteria.map(criterion=>({id:criterion.id,score:5,reason:'Supported.',evidence:'product customers TypeScript delivery'}))),requirements:[],countries:[]};
   const evaluation=evaluateStrategy(profile.strategy,raw,job.description!,job.location);
   return {assessment:{score:evaluation.score,eligibility:'eligible' as const,summary:'Supported fit.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null,evaluation},inputTokens:1,outputTokens:1};
  },
  verify:(url,_read,options)=>verifyListing(url,async requested=>({url:requested,status:200,html:requested===linkedInUrl?'<body>Sign in to continue</body>':'<body>Application page</body>'}),{
   ...options,
   readBoard:async board=>{boardReads++;assert.equal(board.url,'https://jobs.ashbyhq.com/clickhouse');return [{...employer,description:employerDescription}];},
   readAshbyBoard:async()=>({jobs:[{id:'0087feaa-a275-427d-bf4a-14a508708687',title:employer.title,location:employer.location,jobUrl:employerUrl,applyUrl:applicationUrl,descriptionPlain:employerDescription}]}),
  }),notify:async()=>0,
 }});
 const {profile,version}=await store.profile(),saved=await store.job(listing.id);
 return {result,feed:opportunitiesForView(await store.jobs(),profile,version,'all'),saved,ranked,boardReads};
}

test('local acceptance: discovery, classification, employer verification, and daily feed',async t=>{
 const {result,feed,saved,ranked,boardReads}=await rehearse(t);
 assert.equal(result.status,'completed');assert.equal(result.discovered,1);assert.equal(ranked,1);assert.equal(boardReads,1);
 assert.equal(saved?.verification?.status,'open');assert.equal(saved?.verification?.applicationUrl,applicationUrl);
 assert.deepEqual(feed.map(job=>job.id),[listing.id]);
});

test('local acceptance: a different employer posting cannot enter the daily feed',async t=>{
 const {feed,saved,ranked,boardReads}=await rehearse(t,'Different duties and qualifications. '.repeat(80));
 assert.equal(ranked,1);assert.equal(boardReads,1);assert.equal(saved?.verification?.status,'unknown');assert.deepEqual(feed,[]);
});
