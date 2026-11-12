import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {fileURLToPath} from 'node:url';
import {register} from 'tsx/esm/api';
import {load} from 'cheerio';
import {defaultProfile,type Job} from '../packages/core/src/profile';
import {opportunitiesForView} from '../packages/core/src/opportunity-selection';
import {translate} from '../packages/core/src/i18n';

const web=register({namespace:'opportunity-review-tests',tsconfig:fileURLToPath(new URL('../apps/web/tsconfig.json',import.meta.url))});
after(()=>web.unregister());
const {default:Review}=await web.import('../apps/web/src/components/opportunity-review.tsx',import.meta.url);
const {I18nProvider}=await web.import('../apps/web/src/components/i18n.tsx',import.meta.url);
const job:Job={id:'qualified',title:'Qualified product role',company:'Example',location:'London',url:'https://example.com/job',postedAt:null,sourceKey:'linkedin',firstSeen:'2026-11-11',lastSeen:'2026-11-12',description:null,status:'new',notifiedAt:null,evaluatedVersion:1,assessment:{score:90,eligibility:'eligible',summary:'Supported match.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null}};
for(const locale of ['en','es'] as const){
 test(`${locale} review displays qualified counts rather than the discovery backlog`,()=>{
  const allJobs=[job,...Array.from({length:376},(_,i)=>({...job,id:`raw-${i}`,title:'Unchecked listing',assessment:null,evaluatedVersion:null}))];
  const jobs=opportunitiesForView(allJobs,defaultProfile,1,'all');
  const html=renderToStaticMarkup(createElement(I18nProvider,{initial:{locale,preference:locale}},createElement(Review,{jobs,allJobs,profile:defaultProfile,version:1,filter:'all',onFilter:()=>{},source:'all',onSource:()=>{},pendingJob:null,onUpdate:async()=>{},refresh:async()=>{},leads:[],needsSetup:false,onSetup:()=>{}})));
  const $=load(html);
  assert.match($('.review-filters button').eq(0).text(),new RegExp(translate(locale,'For you')+' \\(1\\)'));
  assert.match($('.review-filters button').eq(1).text(),/\(0\)/);
  assert.equal($('.review-list li').length,1);
  assert.ok(!$('body').text().includes('Unchecked listing'));assert.ok(!$('.review-filters').text().includes('377'));
 });
}
