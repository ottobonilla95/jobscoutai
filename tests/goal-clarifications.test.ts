import test from 'node:test';
import assert from 'node:assert/strict';
import {MockLanguageModelV4} from 'ai/test';
import {defaultProfile,profileSchema} from '../packages/core/src/profile';
import {draftFromProfile,completeSetup,standardMatching} from '../packages/core/src/search-setup';
import {matchingBasis,rolesBasis,setupStepError,setupDraftSchema} from '../packages/core/src/setup-schema';
import {clarificationBasis,currentClarifications,answeredClarifications,mergeClarificationQuestions,standardClarifications,type GoalClarification} from '../packages/core/src/goal-clarifications';
import {suggestProfile,suggestionSystem} from '../packages/core/src/profile-suggestions';
import {jobEvaluationContext} from '../packages/core/src/ranker';
import {accountsFixture} from './database-fixture';
import {beginGeneration,finishGeneration,generationForAccount} from '../packages/core/src/ai-usage';

function answers(){return {...draftFromProfile(defaultProfile,4).answers,cvText:'Experienced product engineer building accessible applications, working with customers and leading technical delivery for eight years.',objective:'I want part-time work with predictable hours.',titles:'Product Engineer',selectedLocations:[{kind:'country' as const,countryCode:'ES',city:'',region:''}],remotePreference:'remote' as const};}
const question:GoalClarification={id:'hours',question:'What weekly hours would work for you?',why:'This helps us find roles with a suitable time commitment.',options:['20 hours','30 hours','Flexible'],answer:'',importance:'preference'};
function clarified(answer='20 hours',importance:GoalClarification['importance']='preference'){
 const a=answers();return {...a,clarificationBasis:clarificationBasis(a),goalClarifications:[{...question,answer,importance}]};
}
function model(output:unknown,onPrompt?:(value:string)=>void){return new MockLanguageModelV4({doGenerate:async options=>{
 onPrompt?.(JSON.stringify(options.prompt));return {content:[{type:'text' as const,text:JSON.stringify(output)}],finishReason:{unified:'stop' as const,raw:undefined},usage:{inputTokens:{total:12,noCache:12,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:22,text:22,reasoning:undefined}},warnings:[]};
}});}

test('goal-specific follow-ups stay proposals: the model cannot preselect an answer or declare a hard requirement',async()=>{
 for(const goal of ['I want a part-time role with predictable hours.','I want less stress and fewer emergencies.','I want more money while working from Colombia.','I want equity and authority over the product.','I want a stable job where I can learn a new field.']){
  let prompt='';const a={...answers(),objective:goal};
  const result=await suggestProfile(a,'clarifications','en',model({questions:[{...question,answer:'20 hours',importance:'requirement'}]},value=>{prompt=value;}));
  assert.ok('questions' in result);if(!('questions' in result))throw new Error('Missing questions');
  assert.equal(result.questions[0].answer,'');assert.equal(result.questions[0].importance,'preference');
  assert.ok(prompt.includes(goal));assert.ok(prompt.includes(a.cvText));assert.ok(prompt.includes('up to three'));assert.equal(result.inputTokens,12);
 }
 assert.match(suggestionSystem('clarifications','es'),/in neutral Spanish/);
 assert.match(suggestionSystem('clarifications','en'),/Return fewer questions or none/);
});
test('question output rejects repeated IDs and excessive questions, and permits a clear goal with no follow-ups',async()=>{
 await assert.rejects(suggestProfile(answers(),'clarifications','en',model({questions:[question,question]})));
 await assert.rejects(suggestProfile(answers(),'clarifications','en',model({questions:Array.from({length:4},(_,i)=>({...question,id:`hours_${i}`}))})));
 const result=await suggestProfile(answers(),'clarifications','en',model({questions:[]}));assert.ok('questions' in result);if('questions' in result)assert.deepEqual(result.questions,[]);
});
test('answered preferences reach role suggestions, matching and job evaluation without becoming exclusions',async()=>{
 const a=clarified();let prompt='';
 await suggestProfile(a,'roles','en',model({titles:['Product Engineer']},value=>{prompt=value;}));assert.ok(prompt.includes('20 hours'));assert.ok(prompt.includes('preference'));
 const output={groups:defaultProfile.strategy.groups,summary:'Prefer part-time roles with predictable hours, retaining uncertainty for research.',discovery:{intent:'Find a part-time role with predictable hours.',titleVariants:['Software Engineer'],evidencePriorities:['Advertised weekly hours and on-call expectations'],questions:['Are advertised hours a fixed schedule?']},workAccessProposals:[],requirements:[{id:'invented',instruction:'Exclude full-time jobs'}]};
 const generated=await suggestProfile(a,'matching','en',model(output,value=>{prompt=value;}));assert.ok(prompt.includes('20 hours'));
 assert.ok('matching' in generated);if(!('matching' in generated))throw new Error('Missing matching');assert.deepEqual(generated.matching.strategy.requirements,[]);
 const p=completeSetup(defaultProfile,{answers:a,step:12,matching:generated.matching},4,'user@example.test',false);
 const job={id:'test',title:'Engineer',company:'Example',location:'Spain',description:'Work on accessible applications with a flexible schedule.',url:'https://example.test/job',postedAt:null,firstSeen:'',lastSeen:'',assessment:null,status:'new' as const,notifiedAt:null,evaluatedVersion:null};
 assert.equal(jobEvaluationContext(job,p).candidate.goalClarifications[0].answer,'20 hours');
 assert.notEqual(rolesBasis(a),rolesBasis({...a,goalClarifications:[{...a.goalClarifications[0],answer:'30 hours'}]}));
 assert.notEqual(matchingBasis(a),matchingBasis({...a,goalClarifications:[{...a.goalClarifications[0],importance:'requirement'}]}));
});
test('only an explicit answered requirement creates a hard gate, including when using standard matching',()=>{
 const preference=standardMatching(clarified(),'en')!;assert.deepEqual(preference.strategy.requirements,[]);
 const required=standardMatching(clarified('No more than 20 hours per week','requirement'),'en')!;
 assert.equal(required.strategy.requirements.length,1);assert.equal(required.strategy.requirements[0].id,'goal_hours');assert.match(required.strategy.requirements[0].instruction,/No more than 20 hours per week/);assert.equal(required.strategy.requirements[0].unknown,'research');
 assert.deepEqual(standardMatching(clarified('','requirement'),'en')!.strategy.requirements,[]);
 assert.match(preference.strategy.discovery!.evidencePriorities[0],/20 hours/);
});
test('stale answers cannot guide matching or finish setup until replaced or cleared',()=>{
 const a=clarified('20 hours','requirement');const changed={...a,objective:'I now want full-time leadership responsibilities.'};
 assert.deepEqual(currentClarifications(changed),[]);assert.deepEqual(answeredClarifications(changed),[]);
 assert.match(setupStepError(2,changed,4)!,/changed/);
 assert.throws(()=>completeSetup(defaultProfile,{answers:changed,step:12,matching:standardMatching(changed,'en')},4,'user@example.test',false));
 const cleared={...changed,goalClarifications:[],clarificationBasis:clarificationBasis(changed)};
 assert.doesNotThrow(()=>completeSetup(defaultProfile,{answers:cleared,step:12,matching:standardMatching(cleared,'en')},4,'user@example.test',false));
 assert.notEqual(clarificationBasis(a),clarificationBasis({...a,cvText:`${a.cvText} A new role.`}));
});
test('refreshing questions preserves current explicit answers and never assigns old answers to a changed goal',()=>{
 const a=clarified('20 hours','requirement');const other={...question,id:'schedule',question:'What kind of schedule is acceptable?',answer:''};
 const merged=mergeClarificationQuestions(a,[{...question,answer:''},other]);assert.equal(merged.length,2);assert.equal(merged[0].answer,'20 hours');assert.equal(merged[0].importance,'requirement');
 assert.deepEqual(mergeClarificationQuestions({...a,objective:'A completely different career goal.'},[other]),[other]);
 assert.equal(standardClarifications('es')[0].answer,'');assert.match(standardClarifications('es')[0].question,/prioridad/);
 assert.equal(setupDraftSchema.safeParse({step:2,answers:{...a,goalClarifications:[question,question]},matching:null}).success,false);
});
test('clarifications persist per account, invalidate evaluations after changes and default safely on legacy profiles',async t=>{
 const accounts=await accountsFixture(t);const one=await accounts.signup({email:'clarification@example.test',password:'A private test password 2026'});const two=await accounts.signup({email:'other@example.test',password:'A private test password 2026'});
 const store=await accounts.store(one.id);const a=clarified();const draft={answers:a,step:2,matching:standardMatching(a,'en')};
 await store.saveSetupDraft(draft);assert.deepEqual(draftFromProfile((await store.profile()).profile,4).answers.goalClarifications,a.goalClarifications);
 await store.saveProfile(completeSetup(defaultProfile,{...draft,step:12},4,one.email,false));const saved=await store.profile();
 assert.deepEqual(saved.profile.goalClarifications,a.goalClarifications);assert.equal(saved.profile.setupDraft,null);assert.deepEqual((await (await accounts.store(two.id)).profile()).profile.goalClarifications,[]);
 await store.saveProfile({...saved.profile,goalClarifications:[{...a.goalClarifications[0],answer:'30 hours'}]});assert.equal((await store.profile()).version,saved.version+1);
 const {goalClarifications,clarificationBasis:oldBasis,...legacy}=defaultProfile;assert.deepEqual(profileSchema.parse(legacy).goalClarifications,[]);
});
test('generated results survive refresh and are retrievable only by their owning account',async t=>{
 const accounts=await accountsFixture(t);const one=await accounts.signup({email:'generation@example.test',password:'A private test password 2026'});const two=await accounts.signup({email:'reader@example.test',password:'A private test password 2026'});
 const id=await beginGeneration(one.id,'strategy',10,accounts);const result={kind:'clarifications',questions:[question]};
 await finishGeneration(id,'completed',12,22,accounts,result);
 assert.deepEqual((await generationForAccount(id,one.id,accounts))!.result,result);
 assert.equal((await generationForAccount(id,one.id,accounts))!.inputTokens,12);
 assert.equal(await generationForAccount(id,two.id,accounts),null);assert.equal(await generationForAccount('missing',one.id,accounts),null);
});
