import test from 'node:test';import assert from 'node:assert/strict';
import {accountsFixture,storeFixture} from './database-fixture';
import {ResearchMemory,listingDossier,evidenceRecord,mergeEvidence} from '../packages/core/src/research-memory';
import {defaultProfile,type Job,type Assessment} from '../packages/core/src/profile';
const quote='Guaranteed annual base pay is EUR 90,000.';
const assessment:Assessment={score:80,eligibility:'uncertain',summary:'Potential fit; hours need clarification.',reasons:[],concerns:['What are the actual weekly working hours?'],salaryEvidence:quote,equityEvidence:'Unsupported ownership promise',founderPathEvidence:null};
const job:Job={id:'memory-job',title:'Software Engineer',company:'Example',location:'Madrid',url:'https://example.test/jobs/1',postedAt:null,description:quote+' Build reliable products with colleagues.',firstSeen:'2026-09-01T00:00:00.000Z',lastSeen:'2026-10-05T00:00:00.000Z',assessment:null,status:'new',notifiedAt:null,evaluatedVersion:null};
test('listing dossiers keep exact evidence, original retrieval dates and explicit unanswered concerns',()=>{
 const d=listingDossier(job,assessment,1);assert.equal(d.evidence.length,1);assert.equal(d.evidence[0].quote,quote);assert.equal(d.evidence[0].retrievedAt,job.firstSeen);assert.equal(d.questions[0].status,'open');
 const old={...d,questions:[{...d.questions[0],status:'answered' as const,answer:'20 hours',evidenceIds:[d.evidence[0].id]}]};assert.equal(listingDossier(job,assessment,1,old).questions[0].status,'answered');assert.equal(listingDossier(job,assessment,2,old).questions[0].status,'open');assert.equal(listingDossier(job,assessment,2,old).evidence.length,1);
 assert.equal(mergeEvidence(d.evidence,d.evidence).length,1);
});
test('automatic assessment capture preserves historical records and source refresh timestamps',async t=>{
 const store=await storeFixture(t);await store.upsert(job);await store.assess(job.id,assessment,1);let saved=await store.job(job.id);assert.equal(saved?.research?.evidence.length,1);
 await store.description(job.id,job.description!);saved=await store.job(job.id);assert.ok(saved?.descriptionCheckedAt);
 await store.assess(job.id,{...assessment,salaryEvidence:null,equityEvidence:null},1);assert.equal((await store.job(job.id))?.research?.evidence.length,1);
 assert.equal((await store.job(job.id))?.status,'new');
});
test('job and company research is isolated by account and guarded against stale profile writes',async t=>{
 const accounts=await accountsFixture(t);const a=await accounts.signup({email:'memory-a@example.test',password:'A private test password 2026'}),b=await accounts.signup({email:'memory-b@example.test',password:'A private test password 2026'});
 const sa=await accounts.store(a.id),sb=await accounts.store(b.id);await sa.upsert(job);await sb.upsert(job);const memory=new ResearchMemory(sa);const d=listingDossier(job,assessment,1);
 d.evidence.push(evidenceRecord({topic:'Customers',claim:'Company describes customer use.',quote:'Customers use the product daily.',url:'https://example.test/customers',scope:'company',origin:'web',stance:'supports',retrievedAt:job.firstSeen,recordedAt:job.firstSeen}));
 assert.equal(await memory.save(job.id,d,1),true);assert.equal((await memory.company('Example'))?.identity,'name_match_only');assert.equal(await new ResearchMemory(sb).company('Example'),null);assert.equal((await sb.job(job.id))?.research,null);
 await sa.saveProfile({...defaultProfile,objective:'Different confirmed goal'});assert.equal(await memory.save(job.id,d,1),false);assert.equal((await sa.job(job.id))?.research?.profileVersion,1);
 assert.equal(await new ResearchMemory(sb).save('missing',d,1),false);
});
