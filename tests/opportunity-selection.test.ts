import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,type Job} from '../packages/core/src/profile';
import {opportunitiesForView,qualifiedOpportunity,promisingResearch} from '../packages/core/src/opportunity-selection';
import {storeFixture} from './database-fixture';

const match:Job={id:'qualified',sourceKey:'linkedin',title:'Product Engineer',company:'Example',location:'London',url:'https://example.com/job',postedAt:null,firstSeen:'2026-11-11',lastSeen:'2026-11-12',description:'Build and own the product with customers.',status:'new',evaluatedVersion:1,notifiedAt:null,assessment:{score:90,eligibility:'eligible',summary:'Supported fit.',reasons:['Responsibilities advance the stated goal.'],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null}};
test('hundreds of raw discoveries do not inflate the shortlist or research queue',()=>{
  const raw=Array.from({length:376},(_,i)=>({...match,id:`raw-${i}`,assessment:null,evaluatedVersion:null}));
  assert.deepEqual(opportunitiesForView([...raw,match],defaultProfile,1,'all').map(j=>j.id),['qualified']);
  assert.deepEqual(opportunitiesForView(raw,defaultProfile,1,'research'),[]);
  assert.deepEqual(opportunitiesForView(raw,defaultProfile,1,'all'),[]);
});
test('weak, stale, excluded, closed, duplicate and disabled-source jobs never qualify',()=>{
  const variants:Job[]=[{...match,assessment:{...match.assessment!,score:79}},{...match,evaluatedVersion:0},{...match,status:'dismissed'},{...match,duplicateOf:'original'},{...match,sourceKey:'yc'},{...match,assessment:{...match.assessment!,eligibility:'ineligible'}},{...match,tracking:{stage:'not_recorded',recommendation:'exclude',nextAction:'',notes:'',followUp:''}},{...match,verification:{status:'closed',checkedAt:'2026-11-12',applicationUrl:null,note:'Closed'}}];
  for(const job of variants){assert.equal(qualifiedOpportunity(job,defaultProfile,1),false);assert.equal(promisingResearch(job,defaultProfile,1),false);}
  assert.equal(qualifiedOpportunity(match,defaultProfile,1),true);
});
test('research needs a current promising assessment and a question, and remains separate from matches',()=>{
  const research={...match,assessment:{...match.assessment!,eligibility:'uncertain' as const,concerns:['Does this role allow working from the selected country?']}};
  assert.equal(promisingResearch(research,defaultProfile,1),false); // apply + verify is still a qualified match
  const pending={...research,tracking:{stage:'not_recorded' as const,recommendation:'research' as const,nextAction:'Check hiring countries with the employer.',notes:'',followUp:''}};
  assert.deepEqual(opportunitiesForView([pending],defaultProfile,1,'all'),[]);
  assert.deepEqual(opportunitiesForView([pending],defaultProfile,1,'research'),[pending]);
  assert.equal(promisingResearch({...pending,assessment:{...pending.assessment,score:30}},defaultProfile,1),false);
  assert.equal(promisingResearch({...pending,assessment:{...pending.assessment,concerns:[]}},defaultProfile,1),false);
});
test('explicit saves and applications remain accessible after profile changes without being called matches',()=>{
  const saved={...match,status:'saved' as const,evaluatedVersion:0};
  const application={...match,id:'application',assessment:null,evaluatedVersion:null,tracking:{stage:'interviewing' as const,recommendation:'automatic' as const,nextAction:'Prepare interview',notes:'',followUp:''}};
  assert.deepEqual(opportunitiesForView([saved,application],defaultProfile,1,'all'),[]);
  assert.deepEqual(opportunitiesForView([saved,application],defaultProfile,1,'saved'),[saved]);
  assert.deepEqual(opportunitiesForView([saved,application],defaultProfile,1,'applications'),[application]);
});
test('saving through the store rejects raw, weak and stale jobs and accepts a qualified match',async t=>{
  const store=await storeFixture(t);await store.upsert(match);
  assert.equal(await store.saveOpportunity(match.id),false);
  await store.assess(match.id,{...match.assessment!,score:30},1);
  assert.equal(await store.saveOpportunity(match.id),false);
  await store.assess(match.id,match.assessment!,0);
  assert.equal(await store.saveOpportunity(match.id),false);
  await store.assess(match.id,match.assessment!,1);
  assert.equal(await store.saveOpportunity(match.id),true);
  assert.equal((await store.job(match.id))!.status,'saved');
  assert.equal(await store.saveOpportunity('missing'),false);
});
