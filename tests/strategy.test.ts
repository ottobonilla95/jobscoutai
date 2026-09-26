import {brand} from '../packages/core/src/brand';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {defaultStrategy,evaluateStrategy,strategySchema,type Research,type Strategy} from '../packages/core/src/strategy';
import {profileSchema,defaultProfile,type Job} from '../packages/core/src/profile';
import {Store} from '../packages/core/src/store';
import {Accounts} from '../packages/core/src/accounts';
import {inspectPage,verifyListing,publicAddress,safeUrl,pinnedLookup} from '../packages/core/src/verification';
import {recommendation,strongMatch} from '../packages/core/src/recommendation';
import {searchSources} from '../packages/core/src/sources';
import {runSearch} from '../packages/core/src/worker';
const quote='Build useful software with our engineering team and take responsibility for product delivery.';
const research=(strategy:Strategy):Research=>({components:strategy.groups.flatMap(g=>g.criteria.map(c=>({id:c.id,score:5,reason:'Supported overlap',evidence:quote}))),requirements:[],countries:[]});
function fixture(t:test.TestContext){const dir=mkdtempSync(join(tmpdir(),`${brand.slug}-strategy-`));const store=new Store(join(dir,'jobs.sqlite'));t.after(()=>{store.db.close();rmSync(dir,{recursive:true,force:true});});return store;}
const listing={id:'one',title:'Engineer',company:'Test company',location:'London, United Kingdom',url:'https://example.com/jobs/one',postedAt:null,description:quote};
test('legacy profiles acquire neutral strategies without founder gates',()=>{
 const {strategy,postedWithinDays,includeUnknownDates,dailyEvaluationLimit,...old}=defaultProfile;const parsed=profileSchema.parse(old);
 assert.deepEqual(parsed.strategy.requirements,[]);assert.deepEqual(parsed.strategy.workAccess,[]);assert.equal(parsed.postedWithinDays,7);
 assert.equal(strategySchema.safeParse({...defaultStrategy,groups:[...defaultStrategy.groups,...defaultStrategy.groups]}).success,false);
});
test('grouped weighted scoring and caps follow the personal formula, not model totals',()=>{
 const strategy:Strategy={...defaultStrategy,groups:[{id:'role',label:'Role',weight:65,criteria:[{id:'authority',label:'Authority',weight:35,rubric:quote},{id:'skills',label:'Skills',weight:25,rubric:quote},{id:'industry',label:'Industry',weight:20,rubric:quote},{id:'access',label:'Access',weight:20,rubric:quote}]},{id:'finance',label:'Finance',weight:35,criteria:[{id:'cash',label:'Cash',weight:60,rubric:quote},{id:'company',label:'Company',weight:40,rubric:quote}]}],caps:[{criterionId:'cash',atOrBelow:1,maximum:70}]};
 const raw=research(strategy);raw.components.find(c=>c.id==='authority')!.score=4;raw.components.find(c=>c.id==='cash')!.score=1;
 const result=evaluateStrategy(strategy,raw,quote,listing.location);assert.equal(result.groups[0].score,4.7);assert.equal(result.groups[1].score,2.6);assert.equal(result.score,70);assert.equal(result.overall,3.5);
});
test('failed/unknown mandatory gates cannot be rescued by high component scores',()=>{
 const strategy:Strategy={...defaultStrategy,requirements:[{id:'ownership',label:'Ownership',instruction:'Require concrete ownership advantage.',unknown:'research'}]};
 const raw=research(strategy);assert.equal(evaluateStrategy(strategy,raw,quote,'').decision,'research');
 raw.requirements=[{id:'ownership',result:'fail',evidence:quote,reason:'Explicit conflict'}];assert.equal(evaluateStrategy(strategy,raw,quote,'').decision,'exclude');
 raw.requirements[0].evidence='An invented statement';assert.equal(evaluateStrategy(strategy,raw,quote,'').decision,'research');
 assert.equal(evaluateStrategy(defaultStrategy,research(defaultStrategy),quote,'').decision,'apply');
});
test('per-country access treats sponsorship uncertainty differently and supports alternatives',()=>{
 const strategy:Strategy={...defaultStrategy,workAccess:[{country:'MX',access:'authorized',unknownSponsorship:'allow'},{country:'US',access:'sponsorship',unknownSponsorship:'exclude'},{country:'GB',access:'sponsorship',unknownSponsorship:'allow'}]};
 const raw=research(strategy);raw.countries=[{country:'US',locationEvidence:'New York, United States',sponsorship:'unknown',sponsorshipEvidence:null}];
 assert.equal(evaluateStrategy(strategy,raw,quote,'New York, United States').decision,'exclude');
 raw.countries=[{country:'GB',locationEvidence:listing.location,sponsorship:'unknown',sponsorshipEvidence:null}];assert.equal(evaluateStrategy(strategy,raw,quote,listing.location).decision,'apply_verify');
 raw.countries.push({country:'MX',locationEvidence:'Mexico City, Mexico',sponsorship:'unknown',sponsorshipEvidence:null});assert.notEqual(evaluateStrategy(strategy,raw,quote,listing.location+' / Mexico City, Mexico').decision,'exclude');
 raw.countries=[];assert.equal(evaluateStrategy(strategy,raw,quote,'Remote').decision,'research');
});
test('unsupported and duplicated component evidence remains unknown, not a confident score',()=>{
 const raw=research(defaultStrategy);raw.components[0].evidence='Invented job quote';raw.components.push(raw.components[1]);
 const result=evaluateStrategy(defaultStrategy,raw,quote,'');assert.equal(result.components[0].score,null);assert.equal(result.components[1].score,null);assert.equal(result.decision,'apply_verify');
});
test('strategy changes invalidate scores; tracking edits do not; duplicate override persists',t=>{
 const store=fixture(t);const initial=store.profile();store.saveProfile({...initial.profile,strategy:{...defaultStrategy,relocation:'Open to moving'}});assert.equal(store.profile().version,initial.version+1);
 store.upsert(listing);store.upsert({...listing,id:'two',url:'https://other.example/jobs/two',sourceKey:'yc'});assert.equal(store.job('two')!.duplicateOf,'one');
 store.db.prepare('UPDATE jobs SET duplicate_of=NULL,duplicate_reviewed=1 WHERE id=?').run('two');store.upsert({...listing,id:'two',url:'https://other.example/jobs/two',sourceKey:'yc'});assert.equal(store.job('two')!.duplicateOf,null);
 store.track('one',{stage:'applied',recommendation:'automatic',notes:'Private note',nextAction:'Interview',followUp:'2026-10-01'});assert.equal(store.job('one')!.tracking?.stage,'applied');assert.equal(store.profile().version,initial.version+1);
});
test('date windows exclude old listings and distinguish unknown dates',async()=>{
 const adapters={linkedin:async()=>[{...listing,postedAt:new Date().toISOString()},{...listing,id:'old',postedAt:'2020-01-01'},{...listing,id:'unknown'}],yc:async()=>[],company:async()=>[]};
 const result=await searchSources({...defaultProfile,postedWithinDays:3,includeUnknownDates:false},adapters);assert.deepEqual(result.jobs.map(j=>j.id),['one']);
});
test('application verification does not treat a newsletter form or login challenge as an application',async()=>{
 assert.equal(inspectPage('<body><form><input name="firstName"/><input name="email"/></form></body>',listing.url,200).status,'unknown');
 assert.equal(inspectPage('<body>No longer accepting applications</body>',listing.url,200).status,'closed');
 assert.equal(inspectPage('<body>Verify you are human<form><input name="resume"/></form></body>',listing.url,200).status,'unknown');
 const urls:string[]=[];const result=await verifyListing(listing.url,async url=>{urls.push(url);return {url,status:200,html:urls.length===1?'<body><a href="https://apply.example/form">Apply now</a></body>':'<body><form><input type="file" name="resume"/></form></body>'};});assert.equal(result.status,'open');assert.equal(urls.length,2);
});
test('application checks reject private, link-local and credential-bearing destinations',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','::1','::ffff:127.0.0.1','fd00::1','2001:db8::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);for(const url of ['http://example.com','https://user:pass@example.com','https://localhost','https://example.com:8443'])assert.throws(()=>safeUrl(url));
});
test('recommendations require fresh form verification and do not conflate application history',t=>{
 const store=fixture(t);store.upsert(listing);const job=store.job('one')!;job.assessment={score:95,eligibility:'eligible',summary:'Good',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null};job.evaluatedVersion=1;
 assert.equal(recommendation(job),'apply_verify');job.verification={status:'open',checkedAt:new Date().toISOString(),applicationUrl:job.url,note:'Form'};assert.equal(recommendation(job),'apply');
 job.verification.status='closed';assert.equal(strongMatch(job,defaultProfile,1),false);
});
test('daily evaluation limit bounds a worker run without discarding pending jobs',async t=>{
 const store=fixture(t);store.saveProfile({...defaultProfile,cvText:'Experienced engineer working on useful products. '.repeat(4),dailyEvaluationLimit:1});const old=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='test';t.after(()=>{if(old===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=old;});
 let ranked=0;const dependencies={search:async()=>[listing,{...listing,id:'different',company:'Second',url:'https://other.example/job'}],describe:async()=>quote.repeat(3),rank:async()=>{ranked++;return {assessment:{score:80,eligibility:'eligible' as const,summary:'Good',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null},inputTokens:10,outputTokens:10};},notify:async()=>0};
 await runSearch({store,force:true,dependencies});await runSearch({store,force:true,dependencies});assert.equal(ranked,1);assert.equal(store.pending(store.profile().version,10).length,1);
});
test('verification and password reset tokens are purpose-bound, expiring and single-use; resets revoke sessions',async t=>{
 const dir=mkdtempSync(join(tmpdir(),`${brand.slug}-reset-`));const accounts=new Accounts(dir);t.after(()=>{accounts.db.close();rmSync(dir,{recursive:true,force:true});});const user=await accounts.signup({email:'reset@example.test',password:'Old long test password'});
 const verify=accounts.issueToken(user,'verify');assert.equal(await accounts.consumeToken(verify,'reset','New long test password'),false);assert.equal(accounts.verified(user.id),false);assert.equal(await accounts.consumeToken(verify,'verify'),true);assert.equal(await accounts.consumeToken(verify,'verify'),false);
 const session=accounts.session(user);const reset=accounts.issueToken(user,'reset');assert.equal(await accounts.consumeToken(reset,'reset','New long test password'),true);assert.equal(accounts.current(session),null);assert.equal(await accounts.login(user.email,'Old long test password'),null);assert.ok(await accounts.login(user.email,'New long test password'));
 const expired=accounts.issueToken(user,'reset');accounts.db.exec('UPDATE account_tokens SET expires=0');assert.equal(await accounts.consumeToken(expired,'reset','Another test password'),false);
});
test('AI reservations enforce shared budgets across accounts and retain failed-call usage',async t=>{
 const dir=mkdtempSync(join(tmpdir(),`${brand.slug}-ai-budget-`));const oldDir=process.env.DATA_DIR;const oldLimit=process.env.AI_DAILY_CALL_LIMIT;process.env.DATA_DIR=dir;process.env.AI_DAILY_CALL_LIMIT='2';
 const {getAccounts}=await import('../packages/core/src/accounts');const {beginGeneration,finishGeneration}=await import('../packages/core/src/ai-usage');const accounts=getAccounts();
 t.after(()=>{accounts.db.close();rmSync(dir,{recursive:true,force:true});if(oldDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldDir;if(oldLimit===undefined)delete process.env.AI_DAILY_CALL_LIMIT;else process.env.AI_DAILY_CALL_LIMIT=oldLimit;});
 const a=await accounts.signup({email:'budget-one@example.test',password:'Budget test password 123'});const b=await accounts.signup({email:'budget-two@example.test',password:'Budget test password 123'});
 const id=beginGeneration(a.id,'ranking',1);finishGeneration(id,'failed');assert.throws(()=>beginGeneration(a.id,'strategy',1),/budget/);const second=beginGeneration(b.id,'ranking',2);finishGeneration(second,'completed',10,20);assert.throws(()=>beginGeneration(b.id,'ranking',2),/budget/);assert.equal(accounts.db.prepare('SELECT input_tokens FROM ai_generations WHERE id=?').get(second)!.input_tokens,10);
});

test('pinned DNS supports Node dual-stack lookup without resolving the host again',()=>{
 const lookup=pinnedLookup([{address:'8.8.8.8',family:4},{address:'2606:4700:4700::1111',family:6}]);
 lookup('example.com',{all:true},(error,address)=>{assert.equal(error,null);assert.equal(Array.isArray(address),true);assert.equal(address.length,2);});
 lookup('example.com',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
 assert.throws(()=>pinnedLookup([{address:'127.0.0.1',family:4}]),/cannot/);
});
