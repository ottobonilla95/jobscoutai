import test from 'node:test';
import assert from 'node:assert/strict';
import {storeFixture} from './database-fixture';
import {verifyListing} from '../packages/core/src/verification';
import {verifyEvidence} from '../packages/core/src/ranker';
import {observedSearchScope} from '../packages/core/src/linkedin';
import {searchQuery,locationCoverage,type SearchSession} from '../packages/core/src/search-session';
import {listingDossier} from '../packages/core/src/research-memory';
import {ResearchTasks} from '../packages/core/src/research-tasks';
import {runSearch} from '../packages/core/src/worker';
import {relevantResearchQuote} from '../packages/core/src/investigator';
import {defaultProfile,type Job,type JobListing,type Assessment} from '../packages/core/src/profile';

// Synthetic versions of the changed URL, dropped filter and package conflicts
// observed during the founder-path audit. No personal brief or live requests.
const original='https://jobs.ashbyhq.com/example/old-id';
const replacement:JobListing={id:'ashby:example:new-id',sourceKey:'ashby:example',company:'example',title:'Product Engineer',location:'London, UK',url:'https://jobs.ashbyhq.com/example/new-id',postedAt:null,description:'Build customer-facing software. Base salary GBP 140,000. Equity offered, grant percentage unstated.'};
const assessment:Assessment={score:90,eligibility:'eligible',summary:'Strong fit.',reasons:[],concerns:['What equity grant applies?'],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null};
const html=async(url:string)=>({url,status:url===original?404:200,html:url===original?'Not found':'<form><input name="resume" type="file"></form>'});
const job={...replacement,id:'stable-id',url:original,description:'Old compensation and responsibilities for building useful customer-facing software with the product team.'};
function session():SearchSession{return {round:0,page:0,remaining:24,deadline:Date.now()+60000,seen:new Set(),blocked:new Set(),history:new Map(),cache:new Map(),perSource:new Map(),attempts:[],items:[]};}

test('a changed job ID recovers only an exact title/location on the original employer board',async()=>{
 const reads:string[]=[];
 const result=await verifyListing(original,async url=>{reads.push(url);return html(url);},{job,readBoard:async board=>{assert.equal(board.url,'https://jobs.ashbyhq.com/example');return [replacement];}});
 assert.equal(result.status,'open');assert.equal(result.replacement?.url,replacement.url);
 assert.equal(result.recovery?.originalUrl,original);assert.equal(result.recovery?.outcome,'recovered');
 assert.deepEqual(reads,[original,replacement.url]);
});
test('unavailable and ambiguous boards do not establish closure or guess a replacement',async()=>{
 const check=(jobs:JobListing[])=>verifyListing(original,html,{job,readBoard:async()=>jobs});
 const unavailable=await verifyListing(original,html,{job,readBoard:async()=>{throw Error('temporary outage');}});
 assert.equal(unavailable.status,'unknown');assert.equal(unavailable.recovery?.outcome,'unavailable');
 const ambiguous=await check([replacement,{...replacement,id:'other',url:'https://jobs.ashbyhq.com/example/other'}]);
 assert.equal(ambiguous.status,'unknown');assert.equal(ambiguous.recovery?.outcome,'ambiguous');
 for(const candidate of [{...replacement,title:'Sales Engineer'},{...replacement,location:'New York, US'},{...replacement,url:'https://jobs.ashbyhq.com/namesake/new-id'}]){
  const result=await check([candidate]);assert.equal(result.status,'closed');assert.equal(result.replacement,undefined);
 }
 const redirected=await verifyListing(original,async url=>url===original?html(url):{url:'https://jobs.ashbyhq.com/other-company/job',status:200,html:'<form><input name="resume"></form>'},{job,readBoard:async()=>[replacement]});
 assert.equal(redirected.status,'unknown');assert.equal(redirected.replacement,undefined);
});
test('unsupported listing hosts and exhausted deadlines never trigger board discovery',async()=>{
 let reads=0;const readBoard=async()=>{reads++;return [replacement];};
 await verifyListing('https://employer.example/old-job',async url=>({url,status:404,html:''}),{job,readBoard});
 const expired=await verifyListing(original,html,{job,readBoard,deadline:0});
 assert.equal(reads,0);assert.equal(expired.status,'unknown');
});
test('route recovery preserves history and tracking, clears prior fit, and rejects stale profile writes',async t=>{
 const store=await storeFixture(t);await store.upsert({...job,sourceKey:'linkedin'});await store.assess(job.id,assessment,1);
 await store.track(job.id,{stage:'interviewing',recommendation:'automatic',nextAction:'Discuss grant',notes:'Existing history',followUp:''});
 const before=(await store.job(job.id))!;
 const tasks=new ResearchTasks(store),lease=await tasks.claim(before,1);assert.ok(lease);
 const checked=await verifyListing(original,html,{job,readBoard:async()=>[replacement]});const {replacement:current,...verification}=checked;
 assert.ok(current);assert.equal(await store.recoverListingRoute(job.id,original,current,verification,1),true);
 const saved=(await store.job(job.id))!;
 assert.equal(saved.id,before.id);assert.equal(saved.firstSeen,before.firstSeen);assert.deepEqual(saved.tracking,before.tracking);
 assert.equal(saved.url,replacement.url);assert.equal(saved.description,replacement.description);
 assert.equal(saved.assessment,null);assert.equal(saved.evaluatedVersion,null);assert.ok(saved.research?.questions.every(q=>q.status==='open'&&!q.answer));
 assert.equal(await tasks.get(job.id,1),null);assert.equal(await tasks.checkpoint(lease),false);
 assert.equal(await store.recoverListingRoute(job.id,original,current,verification,1),false);
 await store.saveProfile({...defaultProfile,objective:'Changed objective'});
 assert.equal(await store.recoverListingRoute(job.id,replacement.url,{...current,url:original},verification,1),false);
});
test('the worker reassesses a recovered listing before counting it as a strong match',async t=>{
 const previous=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='synthetic';t.after(()=>{if(previous===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previous;});
 const store=await storeFixture(t);await store.saveProfile({...defaultProfile,cvText:'Experienced engineer building useful products with customers and maintaining production software. '.repeat(2),titles:['Product Engineer'],locations:['London, UK'],sources:['companies'],companyBoards:['https://jobs.ashbyhq.com/example'],researchEnabled:false});
 let searches=0,feeds=0;const descriptions:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{feeds++;assert.match(String(input),/^https:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/example\?/);return Response.json({jobs:[{id:'new-id',title:replacement.title,location:replacement.location,jobUrl:replacement.url,descriptionPlain:replacement.description}]});});
 await runSearch({store,force:true,dependencies:{search:async()=>++searches===1?[job]:[],describe:async()=>job.description,rank:async j=>{descriptions.push(j.description!);return {assessment,inputTokens:7,outputTokens:9};},verify:(url,_read,options)=>verifyListing(url,html,options),plan:async()=>({reason:'Continue after changed listing.',queries:['Product Developer'],boards:[],generationId:null,inputTokens:0,outputTokens:0}),notify:async()=>0}});
 assert.deepEqual(descriptions,[job.description,replacement.description]);
 const run=(await store.runs())[0];assert.equal(run.discovery?.rounds[0].strongCandidates,0);
 assert.equal(run.discovery?.metrics?.newStrongWithOpenRoute,1);assert.equal(run.discovery?.metrics?.evaluated,2);
 assert.equal(run.discovery?.metrics?.inputTokens,14);assert.equal(run.discovery?.metrics?.outputTokens,18);
 assert.equal(feeds,1);assert.equal(run.discovery?.requests,1);
});
test('an exhausted shared source budget leaves board recovery unconfirmed without a request',async t=>{
 const previous=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='synthetic';t.after(()=>{if(previous===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previous;});
 const store=await storeFixture(t);await store.saveProfile({...defaultProfile,cvText:'Experienced engineer building useful software products for customers with production responsibility. '.repeat(2),sources:['companies'],companyBoards:['https://jobs.ashbyhq.com/example'],researchEnabled:false});
 let reads=0;t.mock.method(globalThis,'fetch',async()=>{reads++;throw Error('No network request allowed');});
 await runSearch({store,force:true,dependencies:{search:async(_p,s)=>{s!.remaining=0;return [job];},describe:async()=>job.description,rank:async()=>({assessment,inputTokens:0,outputTokens:0}),verify:(url,_read,options)=>verifyListing(url,html,options),notify:async()=>0}});
 const saved=(await store.job(job.id))!;assert.equal(reads,0);assert.equal(saved.url,original);assert.equal(saved.verification?.status,'unknown');assert.equal(saved.verification?.recovery?.outcome,'unavailable');
});
test('a dropped Europe filter is recorded as Ireland and its results are not used as Europe coverage',async()=>{
 const items=[{...replacement,location:'Dublin, Ireland'}];
 const scope=observedSearchScope('<input name="location" value="Ireland">','Europe',items);
 assert.equal(scope.status,'mismatch');assert.equal(scope.observedLocation,'Ireland');assert.deepEqual(scope.resultLocations,['Dublin, Ireland']);
 const s=session();const result=await searchQuery(s,{source:'linkedin',query:'Product Engineer',location:'Europe',page:0},async()=>({jobs:items,scope}));
 assert.deepEqual(result,[]);assert.equal(s.items.length,0);assert.equal(s.attempts[0].found,1);
 const coverage=locationCoverage(['Europe','Colombia'],s.attempts);assert.deepEqual(coverage.checked,[]);assert.deepEqual(coverage.mismatched,['Europe']);assert.deepEqual(coverage.unsearched,['Colombia']);
});
test('matching result locations alone do not verify filters; source controls can confirm them',()=>{
 assert.equal(observedSearchScope('<p>London, UK</p>','London, UK',[replacement]).status,'unconfirmed');
 assert.equal(observedSearchScope('<input name="location" value="London, UK">','London, UK',[replacement]).status,'confirmed');
 const legacy={source:'linkedin',query:'Engineer',location:'UK',page:0,status:'ok' as const,found:4,checkedAt:'2026-11-11'};
 assert.deepEqual(locationCoverage(['UK'],[legacy]).unconfirmed,['UK']);
});
test('mixed bonus packages and equity cash values cannot become guaranteed base or invented grants',()=>{
 const base='EUR 140,000 base salary',variable='EUR 35,000–105,000 performance bonus',equity='EUR 70,000 annual equity value',headline='EUR 175,000–245,000 including base and bonus';
 const description=[base,variable,equity,headline].join('. ');
 const valid=verifyEvidence({...assessment,salaryEvidence:headline,compensation:{base,variable,equity,headline}},description);
 assert.equal(valid.compensation?.base,base);assert.equal(valid.compensation?.variable,variable);assert.equal(valid.compensation?.equity,equity);
 const mixed=verifyEvidence({...assessment,compensation:{base:headline,variable:'Guaranteed bonus of EUR 105,000',equity:'1% equity',headline}},description);
 assert.equal(mixed.compensation?.base,null);assert.equal(mixed.compensation?.variable,null);assert.equal(mixed.compensation?.equity,null);
 const d=listingDossier({...job,description,url:replacement.url,firstSeen:'2026-11-11T00:00:00.000Z'} as Job,valid,1);
 assert.equal(d.evidence.find(e=>e.topic==='Guaranteed base pay')?.quote,base);
 assert.equal(d.evidence.find(e=>e.topic==='Variable pay')?.quote,variable);
 assert.equal(d.evidence.find(e=>e.topic==='Advertised package')?.quote,headline);
 assert.ok(!d.evidence.some(e=>e.quote==='1% equity'));
 const question={topic:'Pay',question:'What guaranteed base pay does this role offer?'};
 assert.equal(relevantResearchQuote(question,headline),false);assert.equal(relevantResearchQuote(question,base),true);
 assert.equal(relevantResearchQuote(question,'EUR 175,000–245,000 base plus bonus'),false);
 const grant={topic:'Equity',question:'What percentage equity grant is offered?'};
 assert.equal(relevantResearchQuote(grant,equity),false);assert.equal(relevantResearchQuote(grant,'An equity grant of 1% fully diluted is offered.'),true);
});
