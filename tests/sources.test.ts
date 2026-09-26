import {brand} from '../packages/core/src/brand';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../packages/core/src/store';
import { defaultProfile, profileSchema } from '../packages/core/src/profile';
import { parseBoard, sourceEnabled } from '../packages/core/src/source-settings';
import { parseYcListings, parseYcDescription, parseCompanyJobs, searchSources } from '../packages/core/src/sources';
import { SourceError } from '../packages/core/src/linkedin';
import { runSearch } from '../packages/core/src/worker';
const yc={id:'yc:example:abc-founding-engineer',sourceKey:'yc',title:'Founding Engineer',company:'Example',location:'Remote',url:'https://www.ycombinator.com/companies/example/jobs/abc-founding-engineer',postedAt:null,description:'Build the first version of a useful product with the founding team. We offer meaningful equity.'};
function fixture(t:test.TestContext){const dir=mkdtempSync(join(tmpdir(),`${brand.slug}-sources-`));const store=new Store(join(dir,'jobs.sqlite'));t.after(()=>{store.db.close();rmSync(dir,{recursive:true,force:true});});return store;}
test('legacy profiles gain source defaults; malformed or empty source selections are rejected',()=>{
 const {sources,companyBoards,...legacy}=defaultProfile;const upgraded=profileSchema.parse(legacy);
 assert.deepEqual(upgraded.sources,['linkedin']);assert.deepEqual(upgraded.companyBoards,[]);
 assert.equal(profileSchema.safeParse({...defaultProfile,sources:[]}).success,false);
 assert.equal(profileSchema.safeParse({...defaultProfile,sources:['companies'],companyBoards:[]}).success,false);
});
test('company sources accept only exact HTTPS board hosts and board paths',()=>{
 assert.equal(parseBoard('https://jobs.ashbyhq.com/example?utm_source=careers')?.key,'ashby:example');
 assert.equal(parseBoard('https://job-boards.greenhouse.io/example')?.key,'greenhouse:example');
 for(const url of ['http://localhost/jobs','https://jobs.ashbyhq.com.evil.test/example','https://user@jobs.ashbyhq.com/example','https://jobs.ashbyhq.com/example/job','https://jobs.ashbyhq.com:9999/example'])assert.equal(parseBoard(url),null);
 assert.equal(sourceEnabled({...defaultProfile,sources:['companies'],companyBoards:['https://jobs.ashbyhq.com/a']},'ashby:b'),false);
});
test('YC listings preserve source identity and exclude links from other hosts',()=>{
 const html='<div><a href="/companies/example"><span>Example (W26)</span></a><a href="/companies/example/jobs/abc-founding-engineer">Founding Engineer</a><div class="break-all">London</div></div><a href="https://evil.test/companies/example/jobs/bad">Ignore</a>';
 const jobs=parseYcListings(html);assert.equal(jobs.length,1);assert.equal(jobs[0].company,'Example');assert.equal(jobs[0].sourceKey,'yc');assert.equal(jobs[0].location,'London');
 assert.throws(()=>parseYcListings('<html>Sign in</html>'),/coverage is unknown/);
});
test('YC description keeps visible equity/visa evidence alongside structured description',()=>{
 const html='<div class="ycdc-card"><h1>Founding Engineer</h1><span>1% - 2% equity</span><strong>Visa</strong>Will sponsor</div><script type="application/ld+json">'+JSON.stringify({'@type':'JobPosting',description:'<p>Build the company first product and own technical decisions with our founding team.</p>'})+'</script>';
 const text=parseYcDescription(html);assert.match(text,/1% - 2% equity/);assert.match(text,/Will sponsor/);assert.match(text,/technical decisions/);
});
test('company feeds exclude unlisted roles, preserve compensation, and namespace IDs',()=>{
 const board=parseBoard('https://jobs.ashbyhq.com/example')!;
 const job={id:'abc',title:'Founding Engineer',location:'London',jobUrl:'https://jobs.ashbyhq.com/example/abc',descriptionPlain:'Build our products.',compensation:{compensationTierSummary:'1% equity'}};
 const jobs=parseCompanyJobs({jobs:[job,{...job,id:'hidden',isListed:false}]},board);
 assert.equal(jobs.length,1);assert.equal(jobs[0].id,'ashby:example:abc');assert.match(jobs[0].description!,/1% equity/);
 assert.equal(parseCompanyJobs({jobs:[{...job,compensation:{compensationTierSummary:null}}]},board).length,1);
 const gh=parseCompanyJobs({jobs:[{id:123,title:'Engineer',location:{name:'Remote'},absolute_url:'https://job-boards.greenhouse.io/example/jobs/123',content:'&lt;p&gt;Build products &amp;amp; own delivery.&lt;/p&gt;'}]},parseBoard('https://boards.greenhouse.io/example')!);
 assert.match(gh[0].description!,/Build products & own delivery/);assert.doesNotMatch(gh[0].description!,/<p>/);
});
test('disabled sources are never called and one failed portal does not discard other results',async()=>{
 let linkedin=0;let company=0;
 const adapters={linkedin:async()=>{linkedin++;throw new SourceError('LinkedIn HTTP 429',true);},yc:async()=>[yc],company:async()=>{company++;return [];}};
 const selected=await searchSources({...defaultProfile,sources:['yc']},adapters);assert.equal(selected.jobs.length,1);assert.equal(linkedin,0);assert.equal(company,0);
 const mixed=await searchSources({...defaultProfile,sources:['linkedin','yc']},adapters);assert.equal(mixed.jobs.length,1);assert.deepEqual(mixed.blocked,['linkedin']);assert.equal(mixed.succeeded,1);assert.match(mixed.errors[0],/429/);
});
test('storage preserves source and cached descriptions; evaluation budget is shared and honors disabled sources',t=>{
 const store=fixture(t);for(let i=0;i<4;i++)store.upsert({...yc,id:String(i),sourceKey:'linkedin',company:`Other employer ${i}`,url:`https://www.linkedin.com/jobs/view/${i}/`});store.upsert(yc);
 assert.equal(store.jobs().find(j=>j.id===yc.id)?.description,yc.description);
 assert.deepEqual(new Set(store.pending(1,2,{...defaultProfile,sources:['linkedin','yc']}).map(j=>j.sourceKey)),new Set(['linkedin','yc']));
 assert.deepEqual(store.pending(1,5,{...defaultProfile,sources:['yc']}).map(j=>j.id),[yc.id]);
 assert.equal(store.pending(1,5,{...defaultProfile,sources:['linkedin','yc']},['linkedin']).length,1);
});
test('worker finishes partial when one source fails and still assesses another without blocked requests',async t=>{
 const store=fixture(t);store.saveProfile({...defaultProfile,sources:['linkedin','yc'],cvText:'Experienced startup engineer and product builder. '.repeat(4)});
 const old=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='test';t.after(()=>{if(old===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=old;});
 store.upsert({...yc,id:'123',sourceKey:'linkedin',company:'Different employer',url:'https://www.linkedin.com/jobs/view/123/',description:null});let described=0;
 const result=await runSearch({store,force:true,dependencies:{search:async()=>({jobs:[yc],errors:['LinkedIn HTTP 429'],blocked:['linkedin'],succeeded:1}),describe:async()=>{described++;return '';},rank:async()=>({assessment:{score:85,eligibility:'uncertain',summary:'Relevant role.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null},inputTokens:1,outputTokens:1}),notify:async()=>0}});
 assert.equal(result.status,'partial');assert.equal(described,0);assert.equal(store.runs()[0].evaluated,1);assert.equal(store.jobs().find(j=>j.id==='123')?.assessment,null);
});

test('disabling a source prevents new emails and holds its uncertain queued digest',async t=>{
 const {notifyMatches}=await import('../packages/core/src/notifications');
 for(const [key,value] of Object.entries({RESEND_API_KEY:'test',EMAIL_FROM:'test@example.com'})){
  const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});
 }
 const store=fixture(t);store.upsert({...yc,id:'123',sourceKey:'linkedin'});
 store.assess('123',{score:90,eligibility:'eligible',summary:'Relevant role.',reasons:[],concerns:[],salaryEvidence:null,equityEvidence:null,founderPathEvidence:null},1);
 const profile={...defaultProfile,email:'me@example.com',emailEnabled:true};let sent=0;
 assert.equal(await notifyMatches(store,{...profile,sources:['yc']},1,async()=>{sent++;}),0);
 await assert.rejects(notifyMatches(store,profile,1,async()=>{throw new Error('Uncertain delivery');}));
 await notifyMatches(store,{...profile,sources:['yc']},1,async()=>{sent++;});assert.equal(sent,0);
 assert.equal(store.db.prepare('SELECT status FROM deliveries').get()!.status,'review');
});
