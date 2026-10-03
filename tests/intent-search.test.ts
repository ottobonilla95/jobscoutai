import test from 'node:test';
import assert from 'node:assert/strict';
import {MockLanguageModelV4} from 'ai/test';
import {defaultProfile,profileSchema} from '../packages/core/src/profile';
import {addLocation,countrySuggestions,locationLabel,locationQuery,parseCitySuggestions,searchLocationSchema,type SearchLocation} from '../packages/core/src/locations';
import {searchTitles} from '../packages/core/src/discovery';
import {activeCountrySources} from '../packages/core/src/country-sources';
import {matchesTitle} from '../packages/core/src/sources';
import {draftFromProfile,completeSetup,standardMatching} from '../packages/core/src/search-setup';
import {matchingBasis,setupStepError} from '../packages/core/src/setup-schema';
import {suggestProfile} from '../packages/core/src/profile-suggestions';
import {evaluateStrategy} from '../packages/core/src/strategy';
import {jobEvaluationContext} from '../packages/core/src/ranker';

const country=(countryCode:string):SearchLocation=>({kind:'country',countryCode,city:'',region:''});
const city=(name:string,countryCode:string,region=''):SearchLocation=>({kind:'city',countryCode,city:name,region});
const discovery={intent:'Find a paid early engineering role with company-building responsibility.',titleVariants:['First Engineer','Core Engineer'],evidencePriorities:['Actual roadmap and product authority','Explicit salary and equity terms'],questions:['Which ownership terms would be worth pursuing?']};
function answers(){return {...draftFromProfile(defaultProfile,4).answers,cvText:'Senior software engineer with nine years building products, leading technical delivery, and working with customers.',objective:'Join an early team with meaningful company-building responsibility.',titles:'Founding Engineer',selectedLocations:[country('GB')],locationChoice:'specific' as const,remotePreference:'flexible' as const};}
function model(output:unknown,onPrompt?:(value:string)=>void){return new MockLanguageModelV4({doGenerate:async options=>{
 onPrompt?.(JSON.stringify(options.prompt));
 return {content:[{type:'text' as const,text:JSON.stringify(output)}],finishReason:{unified:'stop' as const,raw:undefined},usage:{inputTokens:{total:12,noCache:12,cacheRead:undefined,cacheWrite:undefined},outputTokens:{total:22,text:22,reasoning:undefined}},warnings:[]};
}});}

test('countries are localized, cities include their country, and ambiguous cities keep their region',()=>{
 assert.equal(countrySuggestions('España','es')[0].countryCode,'ES');
 assert.equal(countrySuggestions('Germany','es')[0].countryCode,'DE');
 assert.equal(locationLabel(country('DE'),'es'),'Alemania');assert.equal(locationQuery(country('CO')),'Colombia');
 assert.equal(locationQuery(city('Springfield','US','Illinois')),'Springfield, Illinois, United States');
 assert.equal(searchLocationSchema.safeParse(country('XX')).success,false);
 assert.equal(searchLocationSchema.safeParse({...country('ES'),city:'Madrid'}).success,false);
});
test('whole-country selection replaces its cities; duplicates and over-budget selections are prevented',()=>{
 const madrid=city('Madrid','ES');let places=addLocation([],madrid);assert.equal(addLocation(places,madrid),places);
 places=addLocation(places,country('ES'));assert.deepEqual(places,[country('ES')]);assert.equal(addLocation(places,madrid),places);
 places=addLocation(addLocation(places,country('GB')),country('CO'));assert.equal(addLocation(places,country('DE')),places);
});
test('city lookup accepts known places only, deduplicates and excludes addresses and unrecognized countries',()=>{
 const properties={name:'Bogotá',countrycode:'co',state:'Bogotá, Capital District',type:'city'};
 const places=parseCitySuggestions({features:[{properties},{properties},{properties:{...properties,type:'street'}},{properties:{...properties,countrycode:'xx'}}]});
 assert.deepEqual(places,[city('Bogotá','CO')]);assert.throws(()=>parseCitySuggestions({features:'malformed'}));
});
test('new setup requires explicit selected places; old unfiltered profiles remain readable without changing their active search',()=>{
 const a=answers();assert.equal(setupStepError(4,{...a,selectedLocations:[],locationChoice:'anywhere'},4),'Select 1–3 countries or cities from the suggestions.');
 const legacy=profileSchema.parse({...defaultProfile,locations:['']});assert.deepEqual(legacy.searchLocations,[]);
 const matching=standardMatching(a,'en');const profile=completeSetup(defaultProfile,{answers:a,step:12,matching},4,'user@example.test',false);
 const longCity=city('A'.repeat(80),'GB','B'.repeat(80));
 const longAnswers={...a,selectedLocations:[longCity],locations:locationQuery(longCity)};assert.doesNotThrow(()=>completeSetup(defaultProfile,{answers:longAnswers,step:12,matching:standardMatching(longAnswers,'en')},4,'user@example.test',false));
 assert.deepEqual(profile.searchLocations,[country('GB')]);assert.deepEqual(profile.locations,['United Kingdom']);
 assert.notEqual(matchingBasis(a),matchingBasis({...a,selectedLocations:[country('ES')]}));
 assert.equal(activeCountrySources({locations:['Bogotá'],searchLocations:[city('Bogotá','ES')]}).length,0);
 assert.equal(activeCountrySources({locations:['Unrecognized local city'],searchLocations:[city('Tunja','CO')]}).length,3);
});
test('equivalent titles expand discovery within a bounded budget while keeping confirmed roles first',()=>{
 const profile={...defaultProfile,titles:['Founding Engineer'],strategy:{...defaultProfile.strategy,discovery}};
 assert.deepEqual(searchTitles(profile),['Founding Engineer','First Engineer','Core Engineer']);
 assert.equal(matchesTitle('First Engineer',profile),true);assert.equal(matchesTitle('Core Engineering Intern',profile),false);
 assert.equal(matchesTitle('Ingeniero de software sénior',{...profile,titles:['Ingeniero de Software Senior']}),true);
 assert.equal(searchTitles({...profile,strategy:{...profile.strategy,discovery:{...discovery,titleVariants:['founding engineer',...Array.from({length:8},(_,i)=>`Engineer ${i}`)]}}}).length,8);
});
test('generated strategy uses all preferences and cannot infer hard gates or work rights from a CV',async()=>{
 const a={...answers(),workAuthorization:'I can work in the UK only with sponsorship, but keep roles when sponsorship is unstated.'};let prompt='';
 const output={groups:defaultProfile.strategy.groups,summary:'Prioritize supported early engineering responsibilities and ownership potential.',discovery,workAccessProposals:[
  {country:'GB',access:'sponsorship',unknownSponsorship:'allow',sourceQuote:a.workAuthorization},
  {country:'US',access:'authorized',unknownSponsorship:'allow',sourceQuote:'Senior software engineer with nine years'},
 ],requirements:[{id:'invented',instruction:'Require 10% equity'}]};
 const result=await suggestProfile(a,'matching','es',model(output,value=>{prompt=value;}));assert.ok('matching' in result);if(!('matching' in result))return;
 assert.deepEqual(result.matching.strategy.discovery,discovery);assert.deepEqual(result.matching.strategy.workAccess,[{country:'GB',access:'sponsorship',unknownSponsorship:'allow'}]);
 assert.deepEqual(result.matching.strategy.requirements,[]);assert.ok(prompt.includes(a.objective));assert.ok(prompt.includes(a.cvText));assert.ok(prompt.includes('workAuthorization'));assert.ok(prompt.includes('United Kingdom'));
 const raw={components:[],requirements:[],countries:[{country:'GB',locationEvidence:'London, United Kingdom',sponsorship:'unknown' as const,sponsorshipEvidence:null}]};
 assert.equal(evaluateStrategy(result.matching.strategy,raw,'London, United Kingdom','London, United Kingdom').decision,'apply_verify');
 const profile={...defaultProfile,strategy:result.matching.strategy,searchLocations:a.selectedLocations};
 const job={id:'test',title:'Core Engineer',company:'Example',location:'London',description:'Own the technical roadmap and build the first product.',url:'https://example.test/job',postedAt:null,firstSeen:'',lastSeen:'',assessment:null,status:'new' as const,notifiedAt:null,evaluatedVersion:null};
 assert.deepEqual(jobEvaluationContext(job,profile).candidate.strategy.discovery,discovery);
});
test('unsupported authorization proposals fall back to the original explicit requirement',async()=>{
 const a={...answers(),workAuthorization:'My nationality is German, but I have not declared where I can work.'};
 const result=await suggestProfile(a,'matching','en',model({groups:defaultProfile.strategy.groups,summary:'Match stated experience and goals, retaining missing access information as unknown.',discovery,workAccessProposals:[{country:'GB',access:'authorized',unknownSponsorship:'allow',sourceQuote:'A quote the user never provided'}]}));
 assert.ok('matching' in result);if(!('matching' in result))return;assert.deepEqual(result.matching.strategy.workAccess,[]);
 assert.equal(result.matching.strategy.requirements[0].id,'user_work_access');assert.equal(result.matching.strategy.requirements[0].unknown,'research');
});
