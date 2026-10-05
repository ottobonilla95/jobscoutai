import test from 'node:test';
import assert from 'node:assert/strict';
import {MockLanguageModelV4} from 'ai/test';
import {storeFixture,accountsFixture} from './database-fixture';
import {defaultProfile,type Assessment,type JobListing,type Profile} from '../packages/core/src/profile';
import {runSearch} from '../packages/core/src/worker';
import {searchQuery,orderedQueries,queryKey,type SearchSession} from '../packages/core/src/search-session';
import {searchSources,searchCompanyBoard} from '../packages/core/src/sources';
import {SourceError,searchLinkedIn} from '../packages/core/src/linkedin';
import {planAdaptiveSearch,validateAdaptivePlan,fallbackPage,type AdaptivePlan} from '../packages/core/src/adaptive-planner';
import {discoveryScope,freshDiscoveryState} from '../packages/core/src/discovery-state';
import {sourceEnabled} from '../packages/core/src/source-settings';
import {generationForAccount} from '../packages/core/src/ai-usage';
import type {SearchDiscovery,DiscoveryState} from '../packages/core/src/adaptive-search-schema';
import {searchCountrySource} from '../packages/core/src/country-adapters';
import {countrySources} from '../packages/core/src/country-sources';
const empty=():DiscoveryState=>({attempts:[],boards:[]});
const session=():SearchSession=>({round:0,page:0,remaining:24,deadline:Date.now()+60000,seen:new Set(),blocked:new Set(),history:new Map(),cache:new Map(),perSource:new Map(),attempts:[],items:[]});
const report=():SearchDiscovery=>({profileVersion:1,rounds:[],requests:0,requestLimit:24,stopReason:'round_limit'});
const q={source:'linkedin',query:'Software Engineer',location:'Madrid, Spain',page:0};
const description='Build reliable software products with experienced colleagues. Clearly defined responsibilities and predictable working hours.';
const job=(id:string,overrides:Partial<JobListing>={}):JobListing=>({id,title:'Software Engineer',company:`Company ${id}`,location:'Madrid, Spain',url:`https://www.linkedin.com/jobs/view/${id}/`,postedAt:null,description,...overrides});
const assessment:Assessment={score:90,eligibility:'eligible',summary:'Relevant experience and predictable hours.',reasons:['Relevant product experience'],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null};
const plan=(queries=['Ingeniero de software']):AdaptivePlan=>({reason:'Few new matches: try an equivalent local-language title.',queries,boards:[],generationId:null,inputTokens:12,outputTokens:20});
function ai(t:test.TestContext){const old=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='synthetic';t.after(()=>{if(old===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=old;});}
async function ready(t:test.TestContext,patch:Partial<Profile>={}){ai(t);const store=await storeFixture(t);await store.saveProfile({...defaultProfile,titles:['Software Engineer'],locations:['Madrid, Spain'],remoteOnly:false,cvText:'Software engineer with years of product delivery and customer experience. '.repeat(3),objective:'Predictable hours and less stress.',...patch});return store;}
function model(output:unknown,inspect?:(prompt:string)=>void){return new MockLanguageModelV4({doGenerate:async options=>{inspect?.(JSON.stringify(options.prompt));return {content:[{type:'text',text:JSON.stringify(output)}],finishReason:{unified:'stop',raw:undefined},usage:{inputTokens:{total:12,noCache:12,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:20,text:20,reasoning:undefined}},warnings:[]};}});}

test('query budget, per-source fairness, cache reuse and history rotation bound discovery',async()=>{
 const s=session();let reads=0;await searchQuery(s,q,async()=>{reads++;return [job('1')];});
 s.round=1;s.perSource.clear();assert.equal((await searchQuery(s,q,async()=>{reads++;return [];})).length,1);assert.equal(reads,1);assert.equal(s.remaining,23);
 for(let i=0;i<10;i++)await searchQuery(s,{...q,query:`Role ${i}`},async()=>{reads++;return [];});assert.equal(reads,7);
 s.history.set(queryKey(q),'2026-10-01');assert.deepEqual(orderedQueries([q,{...q,query:'Untried'}],s).map(a=>a.query),['Untried','Software Engineer']);
 for(let source=0;source<5;source++)for(let i=0;i<8;i++)await searchQuery(s,{...q,source:`source${source}`,query:`Role ${i}`},async()=>{reads++;return [];});assert.equal(s.remaining,0);assert.equal(reads,24);
 s.deadline=0;assert.deepEqual(await searchQuery(s,{...q,source:'new'},async()=>{throw Error('must not read');}),[]);
});
test('access challenges block the source for the whole run, retaining earlier successful results',async()=>{
 const s=session();await searchQuery(s,q,async()=>[job('2')]);
 await assert.rejects(searchQuery(s,{...q,query:'Other'},async()=>{throw new SourceError('HTTP 429',true);}));
 assert.deepEqual(await searchQuery(s,{...q,query:'Another'},async()=>{throw Error('must not retry');}),[]);assert.equal(s.attempts[1].status,'blocked');assert.equal(s.items.length,1);
 const result=await searchSources({...defaultProfile,titles:['Software Engineer'],remoteOnly:false}, {linkedin:async()=>{throw new SourceError('Stopped',true);},yc:async()=>[],company:async()=>[]},s);
 assert.equal(result.jobs.length,1);assert.equal(result.jobs[0].id,'2');
});
test('LinkedIn follow-ups page the confirmed location and preserve remote/date restrictions',async t=>{
 const old=globalThis.fetch;let url='';globalThis.fetch=async input=>{url=String(input);return new Response('No results');};t.after(()=>{globalThis.fetch=old;});
 const s=session();s.page=2;await searchLinkedIn({...defaultProfile,titles:[q.query],locations:[q.location],remoteOnly:true},s);
 const u=new URL(url);assert.equal(u.searchParams.get('start'),'50');assert.equal(u.searchParams.get('location'),q.location);assert.equal(u.searchParams.get('f_WT'),'2');assert.equal(s.attempts[0].page,2);
});
test('Get on Board follow-ups use its supported pagination',async()=>{
 const source=countrySources.find(s=>s.key==='getonbrd-co')!;const s=session();s.page=1;let url='';
 await searchCountrySource(source,{...defaultProfile,titles:['Software Engineer'],locations:['Colombia']},async input=>{url=input;return JSON.stringify({data:[]});},s);
 assert.equal(new URL(url).searchParams.get('page'),'2');assert.equal(s.attempts[0].page,1);
});
test('company feed cache can find an equivalent title without fetching the feed twice',async t=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({jobs:[{id:'1',title:'Ingeniero de software',location:'Madrid',jobUrl:'https://jobs.ashbyhq.com/example/1',descriptionPlain:description}]}));};t.after(()=>{globalThis.fetch=old;});
 const s=session();const p={...defaultProfile,titles:['Software Engineer'],remoteOnly:false};assert.equal((await searchCompanyBoard('https://jobs.ashbyhq.com/example',p,s)).length,0);
 s.round=1;assert.equal((await searchCompanyBoard('https://jobs.ashbyhq.com/example',{...p,titles:['Ingeniero de software']},s)).length,1);assert.equal(calls,1);
});
test('weak and repeated results trigger new queries, stop at strong matches and leave the profile unchanged',async t=>{
 const store=await ready(t);await store.upsert(job('10'));const before=await store.profile();let rounds=0,plans=0,notifications=0;const searched:string[][]=[];
 const result=await runSearch({store,force:true,dependencies:{
  search:async(p,s)=>{searched.push(p.titles);return searchQuery(s!,{...q,query:p.titles[0]},async()=>++rounds===1?[job('10'),job('11')]:[job('12'),job('13')]);},
  describe:async()=>description,rank:async j=>({assessment:{...assessment,score:j.id==='11'?40:90,concerns:j.id==='11'?['Schedule expectations unclear']:[]},inputTokens:5,outputTokens:6}),
  plan:async input=>{plans++;assert.equal(input.report.rounds[0].newCandidates,1);assert.ok(input.feedback?.some(j=>j.concerns.includes('Schedule expectations unclear')));assert.deepEqual(input.profile.titles,before.profile.titles);return plan();},notify:async()=>{notifications++;return 0;}
 }});
 assert.equal(result.status,'completed');assert.equal(plans,1);assert.deepEqual(searched,[['Software Engineer'],['Ingeniero de software']]);assert.deepEqual(await store.profile(),before);assert.equal(notifications,1);
 const run=(await store.runs())[0];assert.equal(run.discovery?.stopReason,'sufficient_matches');assert.equal(run.discovery?.requests,2);assert.equal(run.discovery?.rounds.length,2);assert.equal(run.discovery?.rounds[1].strongCandidates,2);
});
test('canonical duplicates and ineligible jobs cannot satisfy the adaptive stopping condition',async t=>{
 const store=await ready(t);await store.upsert(job('20'));let rounds=0;
 await runSearch({store,force:true,dependencies:{search:async(p,s)=>searchQuery(s!,{...q,query:p.titles[0],page:s!.page},async()=>{rounds++;return [job('21',{url:job('20').url}),job('22')];}),describe:async()=>description,rank:async()=>({assessment:{...assessment,eligibility:'ineligible'},inputTokens:1,outputTokens:1}),plan:async()=>plan([]),notify:async()=>0}});
 const r=(await store.runs())[0].discovery!;assert.equal(rounds,3);assert.equal(r.stopReason,'round_limit');assert.ok(r.rounds.every(a=>a.strongCandidates===0));assert.equal((await store.job('21'))?.duplicateOf,'20');
});
test('evaluation allowance and source budget are shared across all attempts',async t=>{
 const store=await ready(t,{maxJobsPerRun:3});let ranked=0;
 await runSearch({store,force:true,dependencies:{search:async(p,s)=>searchQuery(s!,{...q,query:p.titles[0],page:s!.page},async()=>Array.from({length:6},(_,i)=>job(String(s!.round*100+i)))),describe:async()=>description,rank:async()=>{ranked++;return {assessment:{...assessment,score:20},inputTokens:1,outputTokens:1};},plan:async()=>plan([]),notify:async()=>0}});
 assert.equal(ranked,3);const r=(await store.runs())[0];assert.equal(r.evaluated,3);assert.equal(r.discovery?.rounds.length,3);assert.equal(r.discovery?.stopReason,'evaluation_budget');assert.equal(r.discovery?.requests,3);
});
test('exhausted daily evaluations avoid source and planner calls',async t=>{
 const store=await ready(t,{dailyEvaluationLimit:1});const id=await store.claim(true);assert.ok(id);await store.finish(id,'completed',{discovered:1,evaluated:1,matched:0,inputTokens:0,outputTokens:0},null);
 await runSearch({store,force:true,dependencies:{search:async()=>{throw Error('must not search');},describe:async()=>description,rank:async()=>{throw Error('must not rank');},plan:async()=>{throw Error('must not plan');},notify:async()=>0}});
 assert.equal((await store.runs())[0].discovery?.stopReason,'evaluation_budget');assert.equal((await store.runs())[0].discovery?.requests,0);
});
test('profile edits during a search stop evaluation, planning and notifications while preserving coverage',async t=>{
 const store=await ready(t);let ranked=0,planned=0,notified=0;
 await runSearch({store,force:true,dependencies:{search:async(p,s)=>{const found=await searchQuery(s!,q,async()=>[job('30')]);await store.saveProfile({...p,objective:'A new goal'});return found;},describe:async()=>description,rank:async()=>{ranked++;return {assessment,inputTokens:0,outputTokens:0};},plan:async()=>{planned++;return plan();},notify:async()=>{notified++;return 0;}}});
 assert.equal(ranked+planned+notified,0);const r=(await store.runs())[0].discovery!;assert.equal(r.stopReason,'profile_changed');assert.equal(r.requests,1);assert.equal(r.rounds[0].attempts.length,1);
});
test('planner failure falls back to untried approved pages and reports the partial run',async t=>{
 const store=await ready(t);const pages:number[]=[];
 const result=await runSearch({store,force:true,dependencies:{search:async(p,s)=>{pages.push(s!.page);return searchQuery(s!,{...q,page:s!.page},async()=>[]);},describe:async()=>description,rank:async()=>({assessment,inputTokens:0,outputTokens:0}),plan:async()=>{throw Error('provider unavailable');},notify:async()=>0}});
 assert.equal(result.status,'partial');assert.deepEqual(pages,[0,1,2]);assert.match((await store.runs())[0].error!,/Adaptive planning was unavailable/);
});
test('board plans require exact matching citations, supported hosts, selected sources and valid role references',()=>{
 const p={...defaultProfile,titles:['Software Engineer'],sources:['companies'] as const as Profile['sources'],companyBoards:['https://jobs.ashbyhq.com/known']};
 const output={reason:'Discover another relevant employer.',queries:[{roleIndex:0,query:'Software Developer'},{roleIndex:1,query:'Unconfirmed'}],boards:[{url:'https://jobs.ashbyhq.com/real',sourceUrl:'https://jobs.ashbyhq.com/real/123'},{url:'https://jobs.ashbyhq.com/guessed',sourceUrl:'https://jobs.ashbyhq.com/real/123'},{url:'https://evil.example/other',sourceUrl:'https://evil.example/other'}]};
 const valid=validateAdaptivePlan(output,p,[output.boards[0].sourceUrl],empty());assert.deepEqual(valid.queries,['Software Developer']);assert.equal(valid.boards.length,1);
 assert.equal(validateAdaptivePlan(output,p,[],empty()).boards.length,0);assert.equal(validateAdaptivePlan(output,{...p,sources:['linkedin']},[output.boards[0].sourceUrl],empty()).boards.length,0);
});
test('real structured planner persists generation results, usage and observed feedback for the owner',async t=>{
 const store=await ready(t);let prompt='';const before=await store.profile();const output={reason:'Low matching scores: try a common equivalent.',queries:[{roleIndex:0,query:'Software Developer'}],boards:[]};
 const result=await planAdaptiveSearch({store,profile:before.profile,state:empty(),report:report(),feedback:[{title:'Software Engineer',score:30,eligibility:'uncertain',concerns:['Long working hours'],decision:'research'}]},model(output,p=>{prompt=p;}));
 assert.ok(result.generationId);assert.equal(result.inputTokens,12);assert.equal(result.outputTokens,20);assert.match(prompt,/Long working hours/);assert.match(prompt,/Madrid, Spain/);assert.match(prompt,/Preserve the confirmed role families/);
 const accounts=await accountsFixture(t); // separate account database must not expose this generation
 assert.equal(await generationForAccount(result.generationId,store.userId,accounts),null);
 const {Accounts}=await import('../packages/core/src/accounts');const saved=await generationForAccount(result.generationId,store.userId,new Accounts(store.db));assert.equal(saved?.status,'completed');assert.deepEqual(saved?.result.queries,['Software Developer']);assert.equal(saved?.result.kind,'adaptive-discovery');assert.deepEqual(await store.profile(),before);
});
test('invalid planner output is marked failed and does not mutate the profile',async t=>{
 const store=await ready(t);const before=await store.profile();await assert.rejects(planAdaptiveSearch({store,profile:before.profile,state:empty(),report:report()},model({reason:'Too short',queries:[{roleIndex:4,query:'wrong'}],boards:[]})));
 assert.equal((await store.db.prepare('SELECT status FROM ai_generations WHERE user_id=?').get(store.userId)).status,'failed');assert.deepEqual(await store.profile(),before);
});
test('discovery memory is account-owned, guarded against stale profiles and resets on meaningful edits',async t=>{
 const accounts=await accountsFixture(t);const a=await accounts.signup({email:'adaptive-a@example.test',password:'A private test password 2026'});const b=await accounts.signup({email:'adaptive-b@example.test',password:'A private test password 2026'});const store=await accounts.store(a.id),other=await accounts.store(b.id);
 await store.saveProfile({...defaultProfile,sources:['companies'],companyBoards:['https://jobs.ashbyhq.com/seed']});const before=await store.profile(),scope=discoveryScope(before.profile);
 const state={attempts:[{...q,status:'ok' as const,found:0,checkedAt:new Date().toISOString()}],boards:[{url:'https://jobs.ashbyhq.com/found',sourceUrl:'https://jobs.ashbyhq.com/found/1',discoveredAt:new Date().toISOString()}]};
 assert.equal(await store.saveDiscoveryState(scope,state,before.version),true);assert.deepEqual((await store.profile()).profile.discoveredCompanyBoards,[state.boards[0].url]);assert.deepEqual(await other.discoveryState(scope),empty());
 assert.equal(sourceEnabled((await store.profile()).profile,'ashby:found'),true);assert.equal(sourceEnabled({...before.profile,discoveredCompanyBoards:[state.boards[0].url],sources:['linkedin']},'ashby:found'),false);
 await store.saveProfile({...before.profile,intervalHours:12});assert.equal((await store.profile()).version,before.version);assert.equal((await store.profile()).profile.discoveredCompanyBoards.length,1);
 await store.saveProfile({...before.profile,objective:'Another goal'});assert.equal((await store.profile()).profile.discoveredCompanyBoards.length,0);assert.equal(await store.saveDiscoveryState(scope,state,before.version),false);
 assert.equal(freshDiscoveryState({...state,attempts:[{...state.attempts[0],checkedAt:'2000-01-01'}]}).attempts.length,0);
 const prior={...state,attempts:[1,2].map(page=>({...state.attempts[0],page}))};assert.equal(fallbackPage({...defaultProfile,titles:[q.query],locations:[q.location]},prior,report()),null);
});
test('closed listings do not stop follow-up discovery as strong matches',async t=>{
 const store=await ready(t);let round=0,checks=0;
 await runSearch({store,force:true,dependencies:{search:async(p,s)=>searchQuery(s!,{...q,query:p.titles[0],page:s!.page},async()=>++round===1?[job('40'),job('41')]:[]),describe:async()=>description,rank:async()=>({assessment,inputTokens:1,outputTokens:1}),verify:async()=>{checks++;return {status:'closed',checkedAt:new Date().toISOString(),applicationUrl:null,note:'Listing closed'};},plan:async()=>plan([]),notify:async()=>0}});
 const r=(await store.runs())[0];assert.equal(round,3);assert.equal(checks,2);assert.equal(r.matched,0);assert.equal(r.discovery?.stopReason,'round_limit');assert.ok(r.discovery?.rounds.every(a=>a.strongCandidates===0));
});
