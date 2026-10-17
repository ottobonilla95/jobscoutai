import test from 'node:test';
import assert from 'node:assert/strict';
import {MockLanguageModelV4} from 'ai/test';
import {accountsFixture,storeFixture as existingStoreFixture} from './database-fixture';
import {defaultProfile} from '../packages/core/src/profile';
import {standardMatching} from '../packages/core/src/search-setup';
import {matchingBasis} from '../packages/core/src/setup-schema';
import {chatRequestSchema,searchChatSchema,chatTurnSchema,type ChatTurn,type SearchChat} from '../packages/core/src/search-chat-schema';
import {applyChatTurn,attachChatCV,updateChatCV,confirmChatCV,requireReviewedCV,ChatConflict,commitSearchChat,generateChatTurn,loadSearchChat,newSearchChat,saveSearchChat} from '../packages/core/src/search-chat';

const experience='Product engineer with seven years building accessible web applications, leading delivery, and working closely with customers.';
async function storeFixture(t:test.TestContext){
  const store=await existingStoreFixture(t);
  await store.saveProfile({...((await store.profile()).profile),onboardingCompleted:false});
  return store;
}
function readyTurn(chat:SearchChat):ChatTurn {
  const {cvText,cvFileName,rolesBasis,clarificationBasis,locations,...answers}=chat.draft.answers;
  return {reply:'We will look for remote Product Engineer roles in Ireland, with climate impact and predictable hours. Search every 24 hours, with email alerts off. Save these preferences or keep chatting.',
    answers:{...answers,name:'Taylor',objective:'Build climate products with predictable hours.',titles:['Product Engineer'],selectedLocations:[{kind:'country',countryCode:'IE',city:'',region:''}],locationChoice:'specific',remotePreference:'remote',intervalHours:24},
    experience:null,settings:chat.settings,ready:true};
}
function prepared(chat:SearchChat){
  const reviewed=confirmChatCV(chat,chat.draft.answers.cvText,chat.draft.answers.cvFileName,'en');
  const next=applyChatTurn(reviewed,readyTurn(reviewed),'I want remote climate product work in Ireland.',4,'en');
  next.draft.matching=standardMatching(next.draft.answers,'en');return next;
}

test('onboarding conversation, CV and proposals resume without changing the active search or score version',async t=>{
  const store=await storeFixture(t);const before=await store.profile();
  const chat=await loadSearchChat(store,4,'en');assert.equal(chat.ready,false);assert.equal(chat.draft.answers.objective,'');
  const uploaded=await saveSearchChat(store,attachChatCV(chat,experience,'cv.txt','en'),chat.revision);
  const next=await saveSearchChat(store,prepared(uploaded),uploaded.revision);
  assert.equal(next.ready,true);assert.equal(next.draft.answers.cvText,experience);
  assert.deepEqual(await loadSearchChat(store,4,'en'),next);
  const after=await store.profile();assert.deepEqual(after,before);
  assert.equal(after.profile.onboardingCompleted,false);
});

test('CV review is required before onboarding chat, persists on refresh, and does not change the active profile',async t=>{
  const store=await storeFixture(t);const before=await store.profile();
  const initial=await loadSearchChat(store,4,'en');
  assert.equal(initial.cvReviewed,false);
  assert.throws(()=>requireReviewedCV(initial,true),/Review your CV/);
  const uploaded=await saveSearchChat(store,updateChatCV(initial,experience,'cv.txt'),initial.revision);
  assert.equal(uploaded.cvReviewed,false);
  assert.deepEqual(uploaded.messages,initial.messages);
  assert.throws(()=>requireReviewedCV(uploaded,true),/Review your CV/);
  const edited=experience+' I also mentor engineers.';
  const reviewed=await saveSearchChat(store,confirmChatCV(uploaded,edited,'cv.txt','en'),uploaded.revision);
  assert.equal(reviewed.cvReviewed,true);
  assert.equal(reviewed.draft.answers.cvText,edited);
  assert.deepEqual(reviewed.messages,initial.messages);
  assert.doesNotThrow(()=>requireReviewedCV(reviewed,true));
  assert.deepEqual(await loadSearchChat(store,4,'en'),reviewed);
  assert.deepEqual(await store.profile(),before);
  const again=confirmChatCV(reviewed,edited,'cv.txt','en');
  assert.deepEqual(again.messages,reviewed.messages);
  const replaced=attachChatCV(reviewed,experience,'replacement.txt','en');
  assert.equal(replaced.cvReviewed,false);
  const replacement=await saveSearchChat(store,replaced,reviewed.revision);
  assert.equal((await loadSearchChat(store,4,'en')).cvReviewed,false);
  const unreviewed=await saveSearchChat(store,{...prepared(replacement),cvReviewed:false},replacement.revision);
  await assert.rejects(()=>commitSearchChat(store,unreviewed.revision,4,'test@example.test',false,'en'),/Review your CV/);
  assert.deepEqual(await store.profile(),before);
});

test('legacy chats start at CV review and confirmation rejects incomplete experience',()=>{
  const chat=newSearchChat({...defaultProfile,onboardingCompleted:false},4,'en');
  const {cvReviewed,...legacy}=chat;
  assert.equal(searchChatSchema.parse(legacy).cvReviewed,false);
  assert.throws(()=>confirmChatCV(chat,'Too short','', 'en'),/at least 100/);
  assert.equal(chatRequestSchema.safeParse({action:'confirm-cv',revision:0,text:' '.repeat(150),name:''}).success,false);
  assert.equal(chatRequestSchema.safeParse({action:'confirm-cv',revision:0,text:experience,name:''}).success,true);
  assert.doesNotThrow(()=>requireReviewedCV(chat,false));
  assert.equal(newSearchChat({...defaultProfile,onboardingCompleted:true},4,'en').cvReviewed,true);
});

test('saving completes onboarding, installs matching and search settings, and leaves the same chat open',async t=>{
  const store=await storeFixture(t);
  const chat=await loadSearchChat(store,4,'en');const cv=attachChatCV(chat,experience,'cv.txt','en');
  const next=prepared(cv);next.settings={...next.settings,sources:['linkedin','yc'],researchEnabled:false,minimumScore:70,postedWithinDays:14};
  next.draft.answers.emailAlerts=true;
  await saveSearchChat(store,next,chat.revision);
  const result=await commitSearchChat(store,1,4,'test@example.test',false,'en');
  const saved=await store.profile();
  assert.equal(saved.profile.onboardingCompleted,true);assert.equal(saved.profile.enabled,true);
  assert.equal(saved.profile.emailEnabled,false);assert.equal(saved.profile.emailAlertsRequested,true);assert.equal(result.verificationNeeded,true);
  assert.equal(saved.profile.intervalHours,24);assert.equal(saved.profile.researchEnabled,false);assert.equal(saved.profile.minimumScore,70);
  assert.deepEqual(saved.profile.sources,['linkedin','yc']);assert.deepEqual(saved.profile.locations,['Ireland']);
  assert.deepEqual(saved.profile.strategy,next.draft.matching!.strategy);
  assert.equal(result.chat.ready,false);assert.ok(result.chat.messages.length>chat.messages.length);
  assert.equal(result.chat.draft.matching?.kind,'existing');assert.equal(result.chat.draft.answers.cvText,experience);
  assert.deepEqual(await loadSearchChat(store,4,'en'),result.chat);
  await assert.rejects(()=>commitSearchChat(store,1,4,'test@example.test',false,'en'),ChatConflict);
});

test('existing users can pause scheduling without changing matching, losing results, or redoing onboarding',async t=>{
  const store=await storeFixture(t);const initial=await loadSearchChat(store,4,'en');
  const next=prepared(attachChatCV(initial,experience,'cv.txt','en'));
  await saveSearchChat(store,next,initial.revision);await commitSearchChat(store,1,4,'test@example.test',true,'en');
  await store.upsert({id:'prior-result',title:'Product Engineer',company:'Climate Co',location:'Ireland',url:'https://example.test/job',postedAt:null});
  const before=await store.profile();const chat=await loadSearchChat(store,4,'en');
  const turn={...readyTurn(chat),answers:{...readyTurn(chat).answers,...chat.draft.answers,titles:chat.draft.answers.titles.split('\n')},settings:{...chat.settings,enabled:false},reply:'Pause automatic searches. Existing results remain available.'};
  const proposal=applyChatTurn(chat,turn,'Pause my automatic searches.',4,'en');
  assert.equal(proposal.draft.matching?.basis,matchingBasis(proposal.draft.answers));
  await saveSearchChat(store,proposal,chat.revision);
  await commitSearchChat(store,chat.revision+1,4,'test@example.test',true,'en');
  const after=await store.profile();assert.equal(after.profile.enabled,false);assert.equal(after.version,before.version);
  assert.deepEqual(after.profile.strategy,before.profile.strategy);assert.equal((await store.jobs()).length,1);
});

test('profile edits that do not change score version still invalidate stale chat proposals',async t=>{
  const store=await storeFixture(t);let chat=await loadSearchChat(store,4,'en');
  chat=await saveSearchChat(store,prepared(attachChatCV(chat,experience,'cv.txt','en')),chat.revision);
  const before=await store.profile();await store.saveProfile({...before.profile,intervalHours:48});
  assert.equal((await store.profile()).version,before.version);
  await assert.rejects(()=>commitSearchChat(store,chat.revision,4,'test@example.test',false,'en'),ChatConflict);
  await assert.rejects(()=>saveSearchChat(store,chat,chat.revision),ChatConflict);
  const refreshed=await loadSearchChat(store,4,'en');
  assert.equal(refreshed.revision,chat.revision+1);assert.equal(refreshed.ready,false);assert.equal(refreshed.draft.answers.intervalHours,48);
  assert.ok(refreshed.messages.length>chat.messages.length);
});

test('chat writes reject a second tab with an outdated conversation revision',async t=>{
  const store=await storeFixture(t);const chat=await loadSearchChat(store,4,'en');
  await saveSearchChat(store,attachChatCV(chat,experience,'first.txt','en'),0);
  await assert.rejects(()=>saveSearchChat(store,attachChatCV(chat,experience,'second.txt','en'),0),ChatConflict);
  assert.equal((await loadSearchChat(store,4,'en')).draft.answers.cvFileName,'first.txt');
});

test('conversations and CV evidence remain isolated by account',async t=>{
  const accounts=await accountsFixture(t);
  const one=await accounts.signup({email:'one@example.test',password:'A private test password 2026'});
  const two=await accounts.signup({email:'two@example.test',password:'A private test password 2026'});
  const store=await accounts.store(one.id);const other=await accounts.store(two.id);
  const chat=await loadSearchChat(store,4,'en');await saveSearchChat(store,attachChatCV(chat,experience,'private.txt','en'),chat.revision);
  const second=await loadSearchChat(other,4,'es');assert.equal(second.draft.answers.cvText,'');assert.equal(second.messages.length,1);
  assert.equal((await loadSearchChat(store,4,'en')).draft.answers.cvFileName,'private.txt');
  assert.equal(await accounts.deleteAccount(one.id,'A private test password 2026'),true);
  assert.equal((await accounts.db.prepare('SELECT * FROM search_chats WHERE user_id=?').all(one.id)).length,0);
  assert.deepEqual(await loadSearchChat(other,4,'es'),second);
});

test('the model cannot bypass readiness validation, inject experience, or make a stale rubric saveable',async t=>{
  const store=await storeFixture(t);const chat=await loadSearchChat(store,4,'en');
  const missing=applyChatTurn(chat,readyTurn(chat),'Find remote climate roles in Ireland.',4,'en');
  assert.equal(missing.ready,false);assert.match(missing.messages.at(-1)!.text,/100 characters/);
  assert.throws(()=>applyChatTurn(chat,{...readyTurn(chat),experience},'Hello.',4,'en'),/experience must come/);
  const next=prepared(attachChatCV(chat,experience,'cv.txt','en'));next.draft.answers.objective='A completely different career goal.';
  await saveSearchChat(store,next,chat.revision);
  await assert.rejects(()=>commitSearchChat(store,1,4,'test@example.test',false,'en'),/matching preferences/);
  assert.equal((await store.profile()).profile.onboardingCompleted,false);
  const changed=applyChatTurn(next,{...readyTurn(next),answers:{...readyTurn(next).answers,objective:'Work on public transport products.'}},'I want public transport roles instead.',4,'en');
  assert.equal(changed.draft.matching,null);
});

test('AI conversational extraction handles several answers together and accounts for model usage',async()=>{
  const profile={...defaultProfile,onboardingCompleted:false};
  const chat=attachChatCV(newSearchChat(profile,4,'en'),experience,'cv.txt','en');
  const turn=readyTurn(chat);
  let prompt='';let system='';
  const model=new MockLanguageModelV4({doGenerate:async options=>{
    prompt=JSON.stringify(options.prompt);system=String(options.prompt.find(m=>m.role==='system')?.content);
    function assertStrictSchema(schema:any){
      if(!schema||typeof schema!=='object')return;
      if(schema.type==='object')assert.deepEqual([...(schema.required||[])].sort(),Object.keys(schema.properties||{}).sort());
      for(const value of Object.values(schema))if(Array.isArray(value))value.forEach(assertStrictSchema);else if(value&&typeof value==='object')assertStrictSchema(value);
    }
    if(options.responseFormat?.type==='json')assertStrictSchema(options.responseFormat.schema);
    return {content:[{type:'text',text:JSON.stringify(turn)}],finishReason:{unified:'stop',raw:undefined},
      usage:{inputTokens:{total:25,noCache:25,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:50,text:50,reasoning:undefined}},warnings:[]};
  }});
  const result=await generateChatTurn(chat,'Taylor. Remote climate roles in Ireland; search daily, no emails.',4,'en',profile,model);
  const updated=applyChatTurn(chat,result.turn,'Taylor. Remote climate roles in Ireland; search daily, no emails.',4,'en');
  assert.equal(updated.draft.answers.name,'Taylor');assert.equal(updated.draft.answers.intervalHours,24);assert.equal(updated.draft.answers.emailAlerts,false);
  assert.equal(result.inputTokens,25);assert.equal(result.outputTokens,50);assert.ok(prompt.includes(experience));
  assert.match(system,/No external tools/);assert.match(system,/explicit opt-in/);assert.match(system,/Never generate or infer experience/);
  assert.equal(chatTurnSchema.safeParse({...turn,settings:{...turn.settings,postedWithinDays:1000}}).success,false);
  assert.equal(chatTurnSchema.safeParse({...turn,settings:{...turn.settings,sources:['indeed']}}).success,false);
});
