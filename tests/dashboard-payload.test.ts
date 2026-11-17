import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {register} from 'tsx/esm/api';
import {storeFixture} from './database-fixture';
import {recordFeedback} from '../packages/core/src/feedback';
import {opportunitiesForView} from '../packages/core/src/opportunity-selection';

const web=register({namespace:'dashboard-payload-tests',tsconfig:fileURLToPath(new URL('../apps/web/tsconfig.json',import.meta.url))});
after(()=>web.unregister());
const {dashboard}=await web.import('../apps/web/src/lib/dashboard.ts',import.meta.url);

test('dashboard omits hidden panel contents without changing filters or persisted history',async t=>{
  const store=await storeFixture(t);
  await store.upsert({id:'role',title:'Engineer',company:'Example',location:'Helsinki',url:'https://example.test/jobs/role',postedAt:null});
  await store.description('role','Source description retained for automatic evaluation. '.repeat(1000));
  await store.assess('role',{score:95,eligibility:'eligible',summary:'Good fit.',reasons:['Relevant work.'],concerns:['Confirm hours.'],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null},1);
  await store.track('role',{stage:'interviewing',recommendation:'apply',notes:'Private interview notes.',nextAction:'Prepare interview questions.',followUp:'2020-01-01'});
  await store.verify('role',{status:'open',checkedAt:new Date().toISOString(),applicationUrl:'https://example.test/apply',note:'Form reachable.'});
  await recordFeedback(store,'role',{reason:'Prefer hands-on engineering work.',archive:false});
  await store.requestResearch('role');
  const before=await store.job('role');
  assert.ok(before?.research);
  const data=await dashboard(store);
  const job=data.jobs[0];
  assert.equal(job.description,null);
  for(const key of ['descriptionCheckedAt','research','researchTask','researchRequested','researchRequestId','feedback'])assert.equal(key in job,false);
  assert.equal(job.tracking.notes,'');assert.equal(job.tracking.nextAction,'');
  assert.deepEqual(job.assessment,before.assessment);
  assert.deepEqual(job.verification,before.verification);
  for(const view of ['all','research','saved','applications','followups','dismissed']){
    assert.deepEqual(opportunitiesForView(data.jobs,data.profile,data.version,view).map(j=>j.id),opportunitiesForView([before],data.profile,data.version,view).map(j=>j.id));
  }
  assert.ok(JSON.stringify(data.jobs).length<JSON.stringify([before]).length/10);
  assert.deepEqual(await store.job('role'),before);
});
