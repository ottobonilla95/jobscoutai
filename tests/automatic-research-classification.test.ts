import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,type Assessment,type Job} from '../packages/core/src/profile';
import {evaluationText} from '../packages/core/src/ranker';
import {evidenceRecord,listingDossier} from '../packages/core/src/research-memory';
import {ResearchTasks} from '../packages/core/src/research-tasks';
import {opportunitiesForView} from '../packages/core/src/opportunity-selection';
import {runSearch} from '../packages/core/src/worker';
import {storeFixture} from './database-fixture';
import {evaluateStrategy} from '../packages/core/src/strategy';

const description='Build and own the product with customers and the engineering team.';
const extra='This role permits working remotely from Colombia.';
const listing={id:'role',sourceKey:'linkedin',title:'Product Engineer',company:'Example',location:'Remote',url:'https://example.test/jobs/role',postedAt:null,description};
const assessment:Assessment={score:90,eligibility:'uncertain',summary:'Strong role; location needs confirmation.',reasons:['Relevant product work.'],concerns:['Can this role be done from Colombia?'],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null};

test('only answered quotes from the same vacancy can enter follow-up scoring',()=>{
 const job={...listing,firstSeen:new Date().toISOString(),lastSeen:new Date().toISOString(),status:'new' as const,notifiedAt:null,evaluatedVersion:1,assessment};
 const dossier=listingDossier(job,assessment,1);
 const role=evidenceRecord({topic:'Location',claim:'Remote work',quote:extra,url:listing.url,scope:'job',origin:'listing',stance:'supports',recordedAt:job.firstSeen,retrievedAt:job.firstSeen});
 const company=evidenceRecord({topic:'Location',claim:'Company policy',quote:'The company has an office in Colombia.',url:'https://example.test/about',scope:'company',origin:'web',stance:'supports',recordedAt:job.firstSeen,retrievedAt:job.firstSeen});
 dossier.evidence.push(role,company);dossier.questions=dossier.questions.map(question=>({...question,status:'answered',evidenceIds:[role.id,company.id]}));
 assert.match(evaluationText(job,dossier),/permits working remotely from Colombia/);
 assert.doesNotMatch(evaluationText(job,dossier),/company has an office/);
 dossier.questions=dossier.questions.map(question=>({...question,status:'open'}));
 assert.doesNotMatch(evaluationText(job,dossier),/permits working remotely from Colombia/);
});

test('checked role research is automatically used for a fresh verdict, once',async t=>{
 const previousKey=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='fixture';t.after(()=>{if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;});
 const store=await storeFixture(t);
 await store.saveProfile({...defaultProfile,cvText:'Experienced engineer who builds products with customers. '.repeat(4)});
 const {profile,version}=await store.profile();await store.upsert(listing);
 const raw={components:profile.strategy.groups.flatMap(group=>group.criteria.map(criterion=>({id:criterion.id,score:5,reason:'Supported fit.',evidence:description}))),requirements:[],countries:[]};
 const evaluated=evaluateStrategy(profile.strategy,raw,description,listing.location);
 await store.assess(listing.id,{...assessment,evaluation:{...evaluated,decision:'research'}},version);
 let ranked=0;
 const dependencies={search:async()=>[],describe:async()=>description,
  rank:async (_job:Job,_profile:typeof profile,_account?:string,_deadline?:number,research?:Job['research'])=>{
   ranked++;assert.ok(research);assert.match(evaluationText(_job,research),/permits working remotely from Colombia/);
   return {assessment:{...assessment,eligibility:'eligible' as const,concerns:[],score:95,evaluation:evaluated},inputTokens:3,outputTokens:4};
  },notify:async()=>0,verify:async()=>({status:'open' as const,checkedAt:new Date().toISOString(),applicationUrl:listing.url,note:'Checked form.'}),
  investigate:async()=>{
   const current=(await store.job(listing.id))!,tasks=new ResearchTasks(store),task=(await tasks.claim(current,version))!;
   const dossier=listingDossier(current,current.assessment!,version,current.research);
   dossier.generationIds=['checked-role'];const evidence=evidenceRecord({topic:'Location',claim:'Remote work',quote:extra,url:listing.url,scope:'job',origin:'listing',stance:'supports',recordedAt:new Date().toISOString(),retrievedAt:new Date().toISOString()});dossier.evidence.push(evidence);
   dossier.questions=dossier.questions.map(question=>({...question,status:'answered',answer:extra,evidenceIds:[evidence.id]}));
   assert.equal(await tasks.publish(task,dossier,false),true);
   return {status:'completed' as const,generationId:'checked-role',inputTokens:2,outputTokens:2,verifiedEvidence:1,answered:1,unresolved:0};
  }};
 await runSearch({store,force:true,dependencies});
 const saved=(await store.job(listing.id))!;
 assert.equal(ranked,1);assert.equal(saved.assessment?.researchGenerationId,'checked-role');assert.equal(saved.assessment?.researchReviewed,true);
 assert.deepEqual(opportunitiesForView([saved],profile,version,'research'),[]);
 assert.deepEqual(opportunitiesForView([saved],profile,version,'all').map(job=>job.id),[listing.id]);
 await runSearch({store,force:true,dependencies});assert.equal(ranked,1);
});

test('a completed evidence search does not leave an item for manual review',async t=>{
 const previousKey=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='fixture';t.after(()=>{if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;});
 const store=await storeFixture(t);await store.saveProfile({...defaultProfile,cvText:'Experienced engineer who builds products with customers. '.repeat(4)});
 const {profile,version}=await store.profile();await store.upsert(listing);await store.assess(listing.id,assessment,version);
 await store.track(listing.id,{stage:'not_recorded',recommendation:'research',nextAction:'',notes:'',followUp:''});
 await runSearch({store,force:true,dependencies:{search:async()=>[],describe:async()=>description,rank:async()=>{throw new Error('No new role evidence; no extra model call is needed.');},notify:async()=>0,
  investigate:async()=>{const current=(await store.job(listing.id))!,tasks=new ResearchTasks(store),task=(await tasks.claim(current,version))!;const dossier=listingDossier(current,current.assessment!,version,current.research);dossier.generationIds=['no-public-answer'];assert.equal(await tasks.publish(task,dossier,false),true);return {status:'completed' as const,generationId:'no-public-answer',inputTokens:2,outputTokens:2,verifiedEvidence:0,answered:0,unresolved:1};}}});
 const saved=(await store.job(listing.id))!;assert.equal(saved.assessment?.researchReviewed,true);assert.deepEqual(opportunitiesForView([saved],profile,version,'research'),[]);
});
