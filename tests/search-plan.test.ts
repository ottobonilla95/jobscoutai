import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProfile,profileSchema,type Job} from '../packages/core/src/profile';
import {searchTargets,searchTrackSchema,type SearchTrack} from '../packages/core/src/search-plan';
import {draftFromProfile,completeSetup,standardMatching} from '../packages/core/src/search-setup';
import {matchingBasis} from '../packages/core/src/setup-schema';
import {discoveryScope} from '../packages/core/src/discovery-state';
import {evaluateStrategy,defaultStrategy,verifiedExcerpt,supported} from '../packages/core/src/strategy';
import {promisingResearch,qualifiedOpportunity} from '../packages/core/src/opportunity-selection';
import {parsePublicJob} from '../packages/core/src/public-job';
import {validateAdaptivePlan} from '../packages/core/src/adaptive-planner';
import {activeCountrySources} from '../packages/core/src/country-sources';
import {listingWithinAge} from '../packages/core/src/sources';
import {linkedInQueries} from '../packages/core/src/linkedin';
import {runSearch} from '../packages/core/src/worker';
import {searchQuery} from '../packages/core/src/search-session';
import {storeFixture} from './database-fixture';

const country=(countryCode:string)=>({kind:'country' as const,countryCode,city:'',region:''});
const tracks:SearchTrack[]=[
  {area:'europe',locations:[],workMode:'any',workFromCountries:[]},
  {area:'locations',locations:[country('CO')],workMode:'office',workFromCountries:[]},
  {area:'worldwide',locations:[],workMode:'remote',workFromCountries:['DE','FR']},
  {area:'worldwide',locations:[],workMode:'remote',workFromCountries:['CO']},
  {area:'locations',locations:[country('US')],workMode:'any',workFromCountries:[]},
  {area:'locations',locations:[country('IL')],workMode:'any',workFromCountries:[]},
];
const description='Own the technical roadmap, build our first product and work directly with customers and founders.';
const listing={id:'one',title:'Founding Engineer',company:'Example',location:'Berlin, Germany',url:'https://example.test/jobs/one',postedAt:null,description};
test('Europe stays broad, priority cities do not replace countries, and remote bases and sponsorship markets receive separate targets',()=>{
  const profile={...defaultProfile,searchTracks:tracks,preferredLocations:[{kind:'city' as const,countryCode:'DE',city:'Berlin',region:''}]};
  const targets=searchTargets(profile);
  assert.deepEqual(targets.slice(0,6).map(t=>[t.location,t.workMode]),[['Berlin, Germany','any'],['Colombia','office'],['Berlin, Germany','remote'],['Colombia','remote'],['United States','any'],['Israel','any']]);
  for(const location of ['France','Finland','Portugal','United Kingdom','Germany'])assert.ok(targets.some(t=>t.location===location&&t.workMode==='any'));
  assert.ok(targets.some(t=>t.location==='France'&&t.workMode==='remote'));
  assert.equal(activeCountrySources(profile).length,3);
  assert.equal(searchTrackSchema.safeParse({...tracks[3],workMode:'office'}).success,false);
  assert.equal(searchTrackSchema.safeParse({...tracks[3],workFromCountries:['XX']}).success,false);
});
test('sponsorship-only markets are searched explicitly without imposing headquarters-country rules on remote bases',()=>{
  const profile={...defaultProfile,searchTracks:tracks,strategy:{...defaultProfile.strategy,workAccess:[{country:'US',access:'sponsorship' as const,unknownSponsorship:'exclude' as const},{country:'IL',access:'sponsorship' as const,unknownSponsorship:'exclude' as const}]}};
  const queries=linkedInQueries(profile);
  assert.ok(queries.filter(q=>['United States','Israel'].includes(q.location)).every(q=>q.query.includes('visa sponsorship')));
  assert.ok(queries.filter(q=>q.location==='Colombia').every(q=>!q.query.includes('visa sponsorship')));
  assert.equal(new Set(queries.slice(0,6).map(q=>q.track)).size,6);
});
test('regional tracks survive profile completion and invalidate assessments and discovery history',async t=>{
  const store=await storeFixture(t);const original=(await store.profile()).profile;
  const a={...draftFromProfile(defaultProfile,4).answers,cvText:description.repeat(3),objective:'A paid early engineering role with meaningful ownership.',titles:'Founding Engineer',selectedLocations:[],searchTracks:tracks};
  const matching=standardMatching(a,'en');
  const profile=completeSetup(defaultProfile,{step:12,answers:a,matching},4,'',false);
  assert.deepEqual(profileSchema.parse(profile).searchTracks,tracks);
  assert.ok(profile.strategy.requirements.some(r=>r.id==='user_search_scope'));
  assert.notEqual(matchingBasis(a),matchingBasis({...a,searchTracks:tracks.slice(1)}));
  assert.notEqual(discoveryScope(profile),discoveryScope({...profile,searchTracks:[]}));
  await store.saveProfile({...original,searchTracks:tracks});const version=(await store.profile()).version;
  await store.saveProfile({...original,searchTracks:tracks.slice(1)});assert.equal((await store.profile()).version,version+1);
});
test('missing pay changes evidence coverage rather than fit; weak evidence cannot become a strong match',()=>{
  const strategy={...defaultStrategy,requirements:[{id:'package',label:'Package',instruction:'Confirm a meaningful salary and equity package.',unknown:'research' as const}]};
  const components=[{id:'skills',score:5,evidence:description,reason:'Supported experience'},{id:'responsibilities',score:4,evidence:description,reason:'Supported company-building work'}];
  const evaluation=evaluateStrategy(strategy,{components,requirements:[],countries:[]},description,listing.location);
  assert.equal(evaluation.evidenceCoverage,65);assert.ok(evaluation.score>=90);assert.equal(evaluation.decision,'research');
  const job:Job={...listing,firstSeen:'',lastSeen:'',status:'new',notifiedAt:null,evaluatedVersion:1,assessment:{score:evaluation.score,eligibility:'uncertain',summary:'Promising scope; verify the package.',reasons:[],concerns:['What salary and equity apply?'],salaryEvidence:null,equityEvidence:null,founderPathEvidence:description,evaluation}};
  assert.equal(promisingResearch(job,defaultProfile,1),true);assert.equal(qualifiedOpportunity(job,defaultProfile,1),false);
  const empty=evaluateStrategy(strategy,{components:[],requirements:[],countries:[]},description,listing.location);
  assert.equal(empty.score,0);assert.equal(empty.evidenceCoverage,0);
  assert.equal(promisingResearch({...job,assessment:{...job.assessment!,score:100,evaluation:empty}},defaultProfile,1),false);
  const lowerFit=evaluateStrategy(strategy,{components:components.map(c=>({...c,score:4})),requirements:[],countries:[]},description,listing.location);
  assert.equal(promisingResearch({...job,assessment:{...job.assessment!,score:75,evaluation:lowerFit}},defaultProfile,1),true);
  assert.equal(promisingResearch({...job,assessment:{...job.assessment!,score:40,evaluation:lowerFit}},defaultProfile,1),false);
});
test('web leads require citations and retrieved job evidence; portfolios, expired postings and snippets cannot become vacancies',()=>{
  const url='https://example.test/jobs/first-engineer';
  const plan={reason:'Find company-building roles beyond a single portal.',queries:[],boards:[],jobUrls:[url,'https://example.test/guessed','https://localhost/internal']};
  const state={attempts:[],boards:[]};
  assert.deepEqual(validateAdaptivePlan(plan,{...defaultProfile,sources:['companies']},[url,'https://localhost/internal'],state).jobUrls,[url]);
  assert.deepEqual(validateAdaptivePlan(plan,defaultProfile,[url],state).jobUrls,[]);
  const record={'@type':'JobPosting',title:'First Engineer',hiringOrganization:{name:'Example'},description:description.repeat(2),jobLocationType:'TELECOMMUTE',applicantLocationRequirements:{'@type':'Country',name:'Colombia'},datePosted:'2020-01-01',baseSalary:{currency:'USD',value:{minValue:120000,maxValue:160000,unitText:'YEAR'}}};
  const page=(data:unknown)=>`<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const job=parsePublicJob(page(record),url);assert.equal(job.sourceKey,'web');assert.match(job.location,/Colombia.*Remote/);assert.match(job.description!,/120000/);
  assert.throws(()=>parsePublicJob('<h1>Portfolio companies</h1>',url));
  assert.throws(()=>parsePublicJob(page([record,record]),url));
  assert.throws(()=>parsePublicJob(page({...record,validThrough:'2020-01-02'}),url));
  assert.equal(listingWithinAge(job,{...defaultProfile,postedWithinDays:0}),true);
  assert.equal(listingWithinAge(job,{...defaultProfile,postedWithinDays:7}),false);
});
test('a bounded discovery run spends its remaining evaluation allowance after collection stops',async t=>{
  const store=await storeFixture(t);await store.saveProfile({...defaultProfile,cvText:description.repeat(3),maxJobsPerRun:10});
  const old=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='test';t.after(()=>{if(old===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=old;});
  let evaluated=0;
  await runSearch({store,force:true,dependencies:{
    search:async(_p,session)=>{
      const jobs=[];
      for(let i=0;i<24;i++)jobs.push(...await searchQuery(session,{source:`source-${i}`,query:'Founding Engineer',location:'Germany',page:session!.round},async()=>[{...listing,id:`job-${session!.round}-${i}`,company:`Example ${session!.round}-${i}`,url:`https://example.test/${session!.round}/${i}`}]));
      return jobs;
    },
    describe:async()=>description,
    rank:async()=>{evaluated++;return {assessment:{score:30,eligibility:'eligible',summary:'Weak fit.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null},inputTokens:1,outputTokens:1};},
    plan:async()=>({reason:'Try another approved page.',queries:[],boards:[],generationId:null,inputTokens:0,outputTokens:0}),notify:async()=>0,
  }});
  assert.equal(evaluated,10);
  const report=(await store.runs())[0].discovery!;assert.equal(report.requests,24);assert.equal(report.rounds.length,3);
});

test('hosted-search citations recover real posting routes when structured URL lists are empty',()=>{
 const cited=['https://wellfound.com/role/l/technical-lead/europe','https://jobs.ashbyhq.com/real/ce8175e4-8d92-434a-8c6d-71d009e5568d','https://jobs.lever.co/employer/4625811e-f69e-47f1-b278-7da3b5bee806'];
 const plan=validateAdaptivePlan({reason:'Find real company-building vacancies.',queries:[],boards:[],jobUrls:[]},{...defaultProfile,sources:['companies']},cited,{attempts:[],boards:[]});
 assert.deepEqual(plan.jobUrls,cited.slice(1));assert.equal(plan.boards.length,1);assert.equal(plan.boards[0].url,'https://jobs.ashbyhq.com/real');
 assert.equal(validateAdaptivePlan({reason:'Find real company-building vacancies.',queries:[],boards:[],jobUrls:[]},defaultProfile,cited,{attempts:[],boards:[]}).jobUrls?.length,0);
});
test('source collection deadline preserves the independent evaluation time allowance',async()=>{
 let reads=0;const session={round:0,page:0,remaining:24,deadline:Date.now()+60000,discoveryDeadline:Date.now()-1 as number|undefined,seen:new Set<string>(),blocked:new Set<string>(),history:new Map<string,string>(),cache:new Map(),perSource:new Map<string,number>(),attempts:[],items:[]};
 await searchQuery(session,{source:'linkedin',query:'Founding Engineer',location:'Colombia',page:0},async()=>{reads++;return [listing];});
 assert.equal(reads,0);assert.equal(session.remaining,24);assert.ok(session.deadline>Date.now());
 session.discoveryDeadline=undefined;
 await searchQuery(session,{source:'linkedin',query:'Founding Engineer',location:'Colombia',page:0},async()=>{reads++;return [listing];});assert.equal(reads,1);
});

test('bounded evaluation prioritizes the requested role family over relaxed portal results without discarding alternatives',async t=>{
 const store=await storeFixture(t);const profile={...(await store.profile()).profile,titles:['Founding Engineer'],sources:['linkedin' as const]};
 await store.saveProfile(profile);
 await store.upsert({...listing,id:'target',title:'Founding Software Engineer',url:'https://www.linkedin.com/jobs/view/100001/'});
 await store.upsert({...listing,id:'relaxed',title:'Optics Laboratory Technician',url:'https://www.linkedin.com/jobs/view/100002/'});
 const pending=await store.pending((await store.profile()).version,2,profile);
 assert.deepEqual(pending.map(j=>j.id),['target','relaxed']);
});

test('presentation quotation marks cannot erase exact source evidence or admit invented claims',()=>{
 const source='Own features from the problem to the shipped product. Equity options are available.';
 for(const quote of ['Own features from the problem to the shipped product','"Own features from the problem to the shipped product"','“Own features from the problem to the shipped product”',"'Own features from the problem to the shipped product'"]){
  assert.equal(verifiedExcerpt(quote,source),'Own features from the problem to the shipped product');assert.equal(supported(quote,source),true);
 }
 assert.equal(supported('"Own the entire business and receive 10% equity"',source),false);
 assert.equal(supported('"Own features … shipped product"',source),false);
 assert.equal(supported('"features"','featuring a product'),false);
 const raw={components:[{id:'skills',score:4,evidence:'"Own features from the problem to the shipped product"',reason:'Exact source evidence.'}],requirements:[],countries:[]};
 const result=evaluateStrategy(defaultStrategy,raw,source,'');assert.equal(result.components.find(c=>c.id==='skills')?.score,4);assert.ok(result.evidenceCoverage!>0);
});
