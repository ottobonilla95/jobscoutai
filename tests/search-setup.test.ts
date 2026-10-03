import test from 'node:test';
import assert from 'node:assert/strict';
import { accountsFixture, storeFixture } from './database-fixture';
import { defaultProfile, profileSchema } from '../packages/core/src/profile';
import { draftFromProfile, completeSetup, standardMatching } from '../packages/core/src/search-setup';
import { firstIncompleteStep, matchingBasis, setupDraftSchema } from '../packages/core/src/setup-schema';
import { minimumSearchIntervalHours } from '../packages/core/src/search-policy';

function readyDraft() {
  const draft=draftFromProfile({...defaultProfile,onboardingCompleted:false},4);
  draft.answers={...draft.answers,cvText:'Product engineer with seven years building accessible web applications, leading delivery, and working closely with customers.',objective:'Build useful climate products with a small team.',titles:'Product Engineer',locationChoice:'specific',selectedLocations:[{kind:'country',countryCode:'CO',city:'',region:''}],remotePreference:'remote'};
  draft.matching=standardMatching(draft.answers,'en');draft.step=12;
  return draft;
}
test('onboarding requires experience, goals, confirmed roles and explicit location/work choices',()=>{
  const empty=draftFromProfile({...defaultProfile,onboardingCompleted:false},4);
  assert.equal(empty.answers.titles,'');assert.equal(empty.answers.objective,'');assert.equal(firstIncompleteStep(empty.answers,4),1);
  assert.throws(()=>completeSetup(defaultProfile,empty,4,'user@example.test',false));
  const draft=readyDraft();assert.equal(firstIncompleteStep(draft.answers,4),null);
  for(const [key,value,step] of [['cvText','',1],['objective','',2],['titles','',3],['selectedLocations',[],4],['remotePreference','',5],['intervalHours',2,10]] as const){
    assert.equal(firstIncompleteStep({...draft.answers,[key]:value},4),step);
    assert.throws(()=>completeSetup(defaultProfile,{...draft,answers:{...draft.answers,[key]:value}},4,'user@example.test',false));
  }
  const complete=completeSetup({...defaultProfile,onboardingCompleted:false},draft,4,'user@example.test',false);
  assert.equal(complete.onboardingCompleted,true);assert.equal(complete.enabled,true);assert.equal(complete.setupDraft,null);
  assert.deepEqual(complete.locations,['Colombia']);assert.equal(complete.salaryExpectation,'');assert.equal(complete.equityExpectation,'');
  assert.deepEqual(complete.strategy.requirements,[]);assert.deepEqual(complete.strategy.workAccess,[]);
});
test('matching must be refreshed when meaningful answers change, while optional identity and schedule edits preserve it',()=>{
  const draft=readyDraft();
  for(const key of ['objective','cvText','titles','constraints','workAuthorization','salaryExpectation','equityExpectation'] as const){
    const edited={...draft,answers:{...draft.answers,[key]:`${draft.answers[key]} changed`}};
    assert.throws(()=>completeSetup(defaultProfile,edited,4,'user@example.test',false),/matching preferences/);
    edited.matching=standardMatching(edited.answers,'en');assert.doesNotThrow(()=>completeSetup(defaultProfile,edited,4,'user@example.test',false));
  }
  assert.equal(matchingBasis(draft.answers),matchingBasis({...draft.answers,name:'New name',intervalHours:24,emailAlerts:true}));
});
test('standard matching keeps explicit dealbreakers and authorization, with no invented requirements',()=>{
  const draft=readyDraft();draft.answers.constraints='No gambling companies.';draft.answers.workAuthorization='I need employer sponsorship in Canada.';
  const matching=standardMatching(draft.answers,'es')!;
  assert.equal(matching.strategy.requirements.length,2);
  assert.match(matching.strategy.requirements[0].instruction,/No gambling companies/);
  assert.match(matching.strategy.requirements[1].instruction,/sponsorship in Canada/);
  assert.equal(matching.strategy.requirements[1].unknown,'research');assert.deepEqual(matching.strategy.workAccess,[]);
  assert.match(matching.summary,/Evaluamos/);
});
test('drafts persist per account without changing the active profile or its evaluation version',async t=>{
  const accounts=await accountsFixture(t);
  const one=await accounts.signup({email:'one@example.test',password:'A private test password 2026'});
  const two=await accounts.signup({email:'two@example.test',password:'A private test password 2026'});
  const store=await accounts.store(one.id);const before=await store.profile();const draft=readyDraft();draft.step=6;
  await store.saveSetupDraft(draft);
  const after=await store.profile();assert.equal(after.version,before.version);assert.equal(after.profile.cvText,before.profile.cvText);
  assert.deepEqual(draftFromProfile(after.profile,4),draft);
  assert.equal((await (await accounts.store(two.id)).profile()).profile.setupDraft,null);
  assert.equal(setupDraftSchema.safeParse({...draft,step:20}).success,false);
  await store.saveProfile(completeSetup(after.profile,{...draft,step:12},4,one.email,false));
  assert.equal((await store.profile()).profile.setupDraft,null);assert.equal((await store.profile()).version,before.version+1);
});
test('email opt-in is held until verification and activates only for the account address',async t=>{
  const accounts=await accountsFixture(t);const user=await accounts.signup({email:'alerts@example.test',password:'A private test password 2026'});
  const store=await accounts.store(user.id);const draft=readyDraft();draft.answers.emailAlerts=true;
  const profile=completeSetup(defaultProfile,draft,4,user.email,false);await store.saveProfile(profile);
  assert.equal(profile.emailAlertsRequested,true);assert.equal(profile.emailEnabled,false);
  const token=await accounts.issueToken(user,'verify');assert.equal(await accounts.consumeToken(token,'verify'),true);
  const saved=(await store.profile()).profile;assert.equal(saved.emailEnabled,true);assert.equal(saved.email,user.email);
});
test('search policy defaults safely, reads valid overrides, and clamps existing profiles',async t=>{
  const previous=process.env.MIN_SEARCH_INTERVAL_HOURS;
  t.after(()=>{if(previous===undefined)delete process.env.MIN_SEARCH_INTERVAL_HOURS;else process.env.MIN_SEARCH_INTERVAL_HOURS=previous;});
  for(const value of ['0','1','10 minutes','3.5','200','']){process.env.MIN_SEARCH_INTERVAL_HOURS=value;assert.equal(minimumSearchIntervalHours(),4);}
  process.env.MIN_SEARCH_INTERVAL_HOURS='2';assert.equal(minimumSearchIntervalHours(),2);
  process.env.MIN_SEARCH_INTERVAL_HOURS='8';assert.equal(minimumSearchIntervalHours(),8);
  const store=await storeFixture(t);
  await store.db.prepare('UPDATE profile SET value=? WHERE user_id=?').run(JSON.stringify({...defaultProfile,intervalHours:1}),store.userId);
  assert.equal((await store.profile()).profile.intervalHours,8);
  const draft=readyDraft();assert.throws(()=>completeSetup(defaultProfile,draft,8,'user@example.test',false));
});
test('worker rejects unfinished profiles and enforces minimum even for queued requests and stale next-run timestamps',async t=>{
  const store=await storeFixture(t);
  await store.saveProfile({...defaultProfile,onboardingCompleted:false,enabled:true});await store.requestRun();assert.equal(await store.claim(),null);
  await store.saveProfile({...defaultProfile,onboardingCompleted:true,enabled:true});const id=await store.claim();assert.ok(id);
  await store.finish(id,'completed',{discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0},null);
  await store.requestRun();await store.db.prepare('UPDATE state SET next_run=? WHERE user_id=?').run('2020-01-01T00:00:00.000Z',store.userId);
  assert.equal(await store.claim(),null);assert.ok(Date.parse((await store.state()).next_run)>Date.now());
  await store.db.prepare('UPDATE runs SET started_at=? WHERE user_id=?').run(new Date(Date.now()-(minimumSearchIntervalHours()+1)*3600000).toISOString(),store.userId);
  assert.ok(await store.claim());
});
test('legacy profiles keep their strategy and do not force existing users through onboarding',()=>{
  const {onboardingCompleted,setupDraft,workAuthorization,matchingSummary,emailAlertsRequested,...legacy}=defaultProfile;
  const restored=profileSchema.parse(legacy);assert.equal(restored.onboardingCompleted,true);
  const draft=draftFromProfile(restored,4);assert.equal(draft.matching?.kind,'existing');assert.deepEqual(draft.matching?.strategy,defaultProfile.strategy);
});

test('AI suggestions validate roles and scoring, account for usage, and cannot add invented hard gates',async()=>{
  const { MockLanguageModelV4 }=await import('ai/test');
  const { suggestProfile }=await import('../packages/core/src/profile-suggestions');
  const mock=(output:unknown)=>new MockLanguageModelV4({doGenerate:async()=>({
    content:[{type:'text',text:JSON.stringify(output)}],finishReason:{unified:'stop',raw:undefined},
    usage:{inputTokens:{total:10,noCache:10,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:20,text:20,reasoning:undefined}},warnings:[],
  })});
  const draft=readyDraft();const roleModel=mock({titles:['Product Engineer','Frontend Engineer']});
  const roles=await suggestProfile(draft.answers,'roles','es',roleModel);
  assert.ok('titles' in roles);
  assert.deepEqual(roles.titles,['Product Engineer','Frontend Engineer']);assert.equal(roles.inputTokens,10);assert.equal(roles.outputTokens,20);
  const matching=await suggestProfile(draft.answers,'matching','en',mock({discovery:{intent:'Find climate product roles that fit the candidate goal.',titleVariants:['Product Engineer'],evidencePriorities:['Relevant product responsibilities'],questions:[]},workAccessProposals:[],groups:defaultProfile.strategy.groups,summary:'We prioritize your engineering experience and stated climate-product goals.',requirements:[{instruction:'Only jobs with equity.'}],workAccess:[{country:'US',access:'authorized'}]}));
  assert.ok('matching' in matching);
  assert.deepEqual(matching.matching?.strategy.requirements,[]);assert.deepEqual(matching.matching?.strategy.workAccess,[]);
  assert.equal(matching.matching?.basis,matchingBasis(draft.answers));assert.equal(matching.matching?.kind,'generated');
  await assert.rejects(suggestProfile(draft.answers,'matching','en',mock({groups:[],summary:'Invalid output'})));
  await assert.rejects(suggestProfile(draft.answers,'roles','en',mock({titles:[]})));
});
