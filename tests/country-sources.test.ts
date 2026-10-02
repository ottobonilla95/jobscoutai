import test from 'node:test';
import assert from 'node:assert/strict';
import { storeFixture } from './database-fixture';
import { defaultProfile } from '../packages/core/src/profile';
import { activeCountrySources, colombiaSearchLocations, countrySources } from '../packages/core/src/country-sources';
import { sourceEnabled, sourceLabel } from '../packages/core/src/source-settings';
import { describeCountryJob, listingDate, parseCountryDescription, parseElEmpleoJobs, parseGetOnBoardJobs, parseMichaelPageJobs, searchCountrySource } from '../packages/core/src/country-adapters';
import { searchSources } from '../packages/core/src/sources';
import { SourceError } from '../packages/core/src/linkedin';
import { notifyMatches } from '../packages/core/src/notifications';

function apiJob(id = 'engineer-example-remote') {
  return {id,attributes:{title:'Software Engineer',remote:true,remote_modality:'remote_local',published_at:Math.floor(Date.now()/1000),
    description:'<p>Build and maintain reliable software products with our engineering team.</p>',
    functions:'<p>Own architecture, delivery, and testing.</p>',benefits:'<p>Equity offered.</p>',min_salary:2000,max_salary:3000,
    company:{data:{attributes:{name:'Example'}}},countries:['Remote'],
    location_tenants:{data:[{id:'colombia',attributes:{name:'Colombia'}}]},
    location_regions:{data:[{id:'south_america',attributes:{name:'South America'}}]},location_cities:{data:[]}}};
}
function elempleoCard(href = '/co/ofertas-trabajo/ingeniero-de-software-123',mode = 'Remoto') {
  return `<div class="result-item"><h2><a class="js-offer-title" href="${href}">Ingeniero de software</a></h2><span class="js-offer-company">Ejemplo</span><span class="js-offer-city">Bogotá</span><span class="js-offer-date">Hoy</span><div class="small"><div class="text-blue-petrol-dark">${mode}</div><div class="small-text">Modalidad laboral</div></div></div>`;
}
const michaelpageCard = '<div class="search-job-tile"><div class="job-title"><h3><a href="/job-detail/software-engineer/ref/jn-092026-12345">Software Engineer</a></h3></div><div class="job-location">Bogotá</div></div>';
const coProfile = {...defaultProfile,locations:['Colombia']};

test('country sources activate from explicit search geography, not authorization or broad remote searches', () => {
  for (const location of ['Colombia','colombia','CO','Remote, Colombia','Bogotá','Bogotá, D.C.','Medellín','Bogotá, CO']) {
    assert.equal(activeCountrySources({locations:[location]}).length,3,location);
  }
  for (const location of ['','Anywhere','Remote','Latin America','Columbia','Denver, CO','Cartagena, Spain','Medellín, Spain']) {
    assert.deepEqual(activeCountrySources({locations:[location]}),[],location);
  }
  assert.deepEqual(colombiaSearchLocations(['Bogotá','Bogotá, Colombia','Colombia','Medellín']),['']);
  assert.deepEqual(colombiaSearchLocations(['Bogotá, Colombia','Medellín']),['Bogotá','Medellín']);
  const authorizationOnly = {...defaultProfile,workAuthorization:'Authorized in Colombia'};
  assert.deepEqual(activeCountrySources(authorizationOnly),[]);
  for (const source of countrySources) {
    assert.equal(sourceLabel(source.key),source.label);
    assert.equal(sourceEnabled(coProfile,source.key),true);
    assert.equal(sourceEnabled(defaultProfile,source.key),false);
  }
});
test('Get on Board preserves expanded employer and remote-region evidence with full description and salary values', () => {
  const [job] = parseGetOnBoardJobs({data:[apiJob()]});
  assert.equal(job.id,'getonbrd-co:engineer-example-remote'); assert.equal(job.company,'Example');
  assert.equal(job.url,'https://www.getonbrd.com/jobs/engineer-example-remote');
  assert.match(job.location,/Remote.*Colombia.*South America/);
  assert.match(job.description!,/Own architecture/); assert.match(job.description!,/Equity offered/);
  assert.match(job.description!,/2000 – 3000/); assert.doesNotMatch(job.description!,/<p>/);
  assert.ok(job.postedAt); assert.deepEqual(parseGetOnBoardJobs({data:[]}),[]);
  assert.throws(()=>parseGetOnBoardJobs({data:[{id:'bad',attributes:{title:'Unusable'}}]}),/Coverage is unknown/);
  assert.throws(()=>parseGetOnBoardJobs({data:[{...apiJob(),id:'../../private'}]}),/Coverage is unknown/);
});
test('ElEmpleo reads real card fields, namespaces IDs, rejects foreign URLs, and keeps work modality', () => {
  const jobs = parseElEmpleoJobs(elempleoCard()+elempleoCard('https://evil.test/co/ofertas-trabajo/engineer-456'));
  assert.equal(jobs.length,1); assert.equal(jobs[0].id,'elempleo-co:123');
  assert.equal(jobs[0].company,'Ejemplo'); assert.equal(jobs[0].location,'Bogotá · Colombia · Remoto');
  assert.ok(jobs[0].postedAt); assert.equal(jobs[0].description,undefined);
  assert.throws(()=>parseElEmpleoJobs('<h1>Sign in</h1>'),/Coverage is unknown/);
  assert.deepEqual(parseElEmpleoJobs('<h1>No encontramos ofertas</h1>'),[]);
  assert.equal(listingDate('2026-9-4'),'2026-09-04T00:00:00.000Z');
  assert.equal(listingDate('2026-02-30'),null); assert.equal(listingDate('unknown'),null);
  assert.equal(listingDate('Hace 2 días',Date.parse('2026-10-03T12:00:00Z')),'2026-10-01T12:00:00.000Z');
  assert.ok(Date.parse(listingDate('Hace 2 meses')!) < Date.now()-59*86400000);
});
test('Michael Page reads search cards without claiming the recruiter is the final employer', () => {
  const [job] = parseMichaelPageJobs(michaelpageCard);
  assert.equal(job.id,'michaelpage-co:jn-092026-12345'); assert.equal(job.company,'Employer not disclosed');
  assert.equal(job.location,'Bogotá'); assert.equal(job.postedAt,null);
  assert.match(parseMichaelPageJobs(michaelpageCard.replace('</div><div class="job-location">','</div><div class="job-properties"><span>Trabajo Remoto</span></div><div class="job-location">'))[0].location,/Trabajo Remoto/);
  assert.throws(()=>parseMichaelPageJobs('<h1>Access challenge</h1>'),/Coverage is unknown/);
  assert.deepEqual(parseMichaelPageJobs('<div class="view-empty">No jobs found</div>'),[]);
  const html = '<article class="job-advert"><div id="job-description"><h2>Descripción</h2><p>Develop software and lead engineering projects for a confidential employer.</p></div></article><aside>Unrelated roles</aside>';
  const description = parseCountryDescription('michaelpage-co',html);
  assert.match(description,/Develop software/); assert.doesNotMatch(description,/Unrelated roles/);
  assert.throws(()=>parseCountryDescription('michaelpage-co','<h1>Robot check</h1>'),/too little description/);
  assert.throws(()=>parseCountryDescription('elempleo-co','<script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',title:'A very long title that should never substitute for missing role requirements',description:'',baseSalary:{currency:'COP',value:5000000}})+'</script>'),/too little description/);
});
test('country description fetches validate source URLs and IDs before any network request', async () => {
  const job = parseElEmpleoJobs(elempleoCard())[0]; let requests = 0;
  const read = async () => { requests++; return '<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'JobPosting',title:'Ingeniero',description:'<p>Build and maintain software products and own engineering delivery.</p>',baseSalary:{currency:'COP',value:5000000}}]})+'</script>'; };
  assert.match(await describeCountryJob(job.id,job,read),/COP/); assert.equal(requests,1);
  for (const bad of [{...job,url:'https://evil.test/co/ofertas-trabajo/engineer-123'},{...job,url:'https://user@www.elempleo.com/co/ofertas-trabajo/engineer-123'},{...job,id:'elempleo-co:456'}]) {
    await assert.rejects(describeCountryJob(bad.id,bad,read),/Invalid country job/);
  }
  assert.equal(requests,1);
});
test('country adapters are bounded by title/location, deduplicate queries and jobs, and honor remote-only', async () => {
  const urls:string[] = [];
  const read = async (url:string) => { urls.push(url); return JSON.stringify({data:[apiJob(),{...apiJob('hybrid-example'),attributes:{...apiJob().attributes,remote_modality:'hybrid'}}]}); };
  const jobs = await searchCountrySource(countrySources[0],{...coProfile,locations:['Bogotá','Medellín'],titles:['Software Engineer','Software Engineer'],remoteOnly:true},read);
  assert.equal(urls.length,1); assert.equal(jobs.length,1);
  const url = new URL(urls[0]); assert.equal(url.searchParams.get('country_code'),'co'); assert.equal(url.searchParams.get('query'),'Software Engineer');
  assert.equal(url.searchParams.get('per_page'),'20'); assert.match(url.searchParams.get('expand')!,/location_tenants/);
  assert.deepEqual(await searchCountrySource(countrySources[0],defaultProfile,read),[]); assert.equal(urls.length,1);
  const localUrls:string[]=[];
  const localRead = async (url:string) => { localUrls.push(url); return elempleoCard(undefined,'Presencial'); };
  assert.deepEqual(await searchCountrySource(countrySources[1],{...coProfile,locations:['Bogotá'],titles:['Ingeniero de software'],remoteOnly:true},localRead),[]);
  assert.equal(localUrls[0],'https://www.elempleo.com/co/ofertas-empleo/bogota/trabajo-ingeniero-de-software');
});
test('Colombia additions run once each, preserve other source results on failures, and obey shared date policy', async () => {
  const calls:string[]=[]; const fresh=parseGetOnBoardJobs({data:[apiJob()]})[0];
  const adapters={linkedin:async()=>[],yc:async()=>[],company:async()=>[],country:async(source:typeof countrySources[number])=>{
    calls.push(source.key);if(source.key==='elempleo-co')throw new SourceError('ElEmpleo: HTTP 403. This source was skipped.',true);
    return source.key==='getonbrd-co'?[fresh,{...fresh,id:'getonbrd-co:old',postedAt:new Date(Date.now()-30*86400000).toISOString()}]:[{...fresh,id:'michaelpage-co:unknown',sourceKey:'michaelpage-co',postedAt:null}];
  }};
  assert.equal((await searchSources(defaultProfile,adapters)).succeeded,1); assert.deepEqual(calls,[]);
  const result=await searchSources({...coProfile,locations:['Colombia','Bogotá'],includeUnknownDates:false},adapters);
  assert.deepEqual(calls,countrySources.map(source=>source.key)); assert.equal(result.succeeded,3);
  assert.deepEqual(result.blocked,['elempleo-co']); assert.deepEqual(result.jobs.map(job=>job.id),[fresh.id]);
});
test('removing Colombia stops evaluation and new alerts for its sources, and holds an already queued digest', async t => {
  const store=await storeFixture(t); const job=parseGetOnBoardJobs({data:[apiJob()]})[0]; await store.upsert(job);
  assert.equal((await store.pending(1,10,coProfile)).length,1); assert.equal((await store.pending(1,10,defaultProfile)).length,0);
  await store.assess(job.id,{score:95,eligibility:'eligible',summary:'Good fit.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null},1);
  for(const [key,value] of Object.entries({RESEND_API_KEY:'test',EMAIL_FROM:'test@example.test'})) {const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
  const profile={...coProfile,email:'test@example.test',emailEnabled:true};let sent=0;
  assert.equal(await notifyMatches(store,{...profile,locations:['Spain']},1,async()=>{sent++;}),0);
  await assert.rejects(notifyMatches(store,profile,1,async()=>{throw new Error('Uncertain delivery');}));
  await notifyMatches(store,{...profile,locations:['Spain']},1,async()=>{sent++;});assert.equal(sent,0);
  assert.equal((await store.db.prepare('SELECT status FROM deliveries').get())!.status,'review');
});
test('distinct anonymous-employer vacancies stay separate while identical listing URLs are deduplicated', async t => {
  const store=await storeFixture(t);const job=parseMichaelPageJobs(michaelpageCard)[0];await store.upsert(job);
  const other={...job,id:'michaelpage-co:jn-092026-67890',url:job.url.replace('12345','67890')};await store.upsert(other);
  assert.equal((await store.job(other.id))!.duplicateOf,null);
  const copy={...job,id:'another-copy'};await store.upsert(copy);
  assert.equal((await store.job(copy.id))!.duplicateOf,job.id);
});
