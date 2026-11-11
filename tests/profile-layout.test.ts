import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createElement,createRef} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fileURLToPath} from 'node:url';
import {register} from 'tsx/esm/api';
import {load} from 'cheerio';
import {defaultProfile} from '../packages/core/src/profile';
import {draftFromProfile,standardMatching} from '../packages/core/src/search-setup';
import {clarificationBasis} from '../packages/core/src/goal-clarifications';
import {translate} from '../packages/core/src/i18n';

const web=register({namespace:'profile-layout-tests',tsconfig:fileURLToPath(new URL('../apps/web/tsconfig.json',import.meta.url))});
after(()=>web.unregister());
const {default:Editor}=await web.import('../apps/web/src/components/search-profile-editor.tsx',import.meta.url);
const {I18nProvider}=await web.import('../apps/web/src/components/i18n.tsx',import.meta.url);
for(const locale of ['en','es'] as const){
 test(`${locale} profile keeps one goal, one work preference and one save action while retaining optional fields`,()=>{
  const a=draftFromProfile({...defaultProfile,onboardingCompleted:true,cvText:'An experienced product engineer. '.repeat(5),objective:'Build useful products with a small team.',titles:['Product Engineer'],searchLocations:[{kind:'country',countryCode:'CO',city:'',region:''}]},4).answers;
  a.clarificationBasis=clarificationBasis(a);
  a.goalClarifications=[{id:'remote',question:'Do you prefer remote, hybrid or onsite?',why:'This determines which opportunities fit.',options:['Remote','Hybrid'],answer:'Hybrid',importance:'requirement'}];
  const matching=standardMatching(a,locale)!;
  matching.strategy.discovery={intent:a.objective,titleVariants:['Software Engineer'],evidencePriorities:['Product responsibilities'],questions:[]};
  const noop=()=>{};
  const html=renderToStaticMarkup(createElement(I18nProvider,{initial:{locale,preference:locale}},createElement(Editor,{
   answers:a,matching,matchingCurrent:true,minimum:4,frequencies:[4,8,24],busy:false,saveState:'Draft saved',error:'',notice:'',invalidStep:null,verificationNotice:null,formRef:createRef(),
   update:noop,onUpload:async()=>{},onSuggest:async()=>{},onClarifications:noop,onClearClarifications:noop,onStandardMatching:noop,onSave:async()=>{},onLocations:noop,onMatching:noop,
  })));
  const $=load(html);
  assert.equal($('#profile-objective').length,1);
  assert.equal($('#profile-work-preference').length,1);
  assert.ok($('.location-chip').text().includes(translate(locale,'Whole country')));
  assert.equal($('.location-refine').text(),translate(locale,'Narrow to cities'));
  assert.equal($('button').filter((_,el)=>$(el).text().includes(translate(locale,'Save search profile'))).length,1);
  for(const id of ['profile-cv','profile-salary','profile-equity','profile-authorization','profile-frequency','profile-constraints'])assert.equal($('#'+id).length,1);
  assert.equal($('textarea').filter((_,el)=>$(el).text()===a.objective).length,1);
  assert.equal($('details.profile-disclosure').length,3);
  assert.equal($('details.profile-disclosure[open]').length,0);
  assert.equal($('details.strategy-details[open]').length,0);
  assert.equal($('#goal-question-remote').length,0);
  assert.equal($('aside').length,0);
 });
}
