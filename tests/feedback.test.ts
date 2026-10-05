import test from 'node:test';import assert from 'node:assert/strict';
import {accountsFixture,storeFixture} from './database-fixture';import {defaultProfile} from '../packages/core/src/profile';
import {recordFeedback,reviewFeedback,removePreference} from '../packages/core/src/feedback';import {jobEvaluationContext} from '../packages/core/src/ranker';import {discoveryScope} from '../packages/core/src/discovery-state';
const listing={id:'feedback-job',title:'Engineer',company:'Example',location:'Spain',url:'https://example.test/jobs/feedback',postedAt:null};
test('feedback stays local until edited and applied; confirmation changes fit without changing hard gates',async t=>{
 const store=await storeFixture(t);await store.upsert(listing);const initial=await store.profile(),scope=discoveryScope(initial.profile);
 const f=await recordFeedback(store,listing.id,{reason:'The team is too large; I prefer hands-on work.',archive:false});assert.equal((await store.profile()).version,initial.version);assert.deepEqual((await store.profile()).profile.reviewedPreferences,[]);assert.equal(f.status,'proposed');
 const applied=await reviewFeedback(store,listing.id,{id:f.id,action:'apply',preference:'Prefer hands-on product work and small teams.'});assert.equal(applied.status,'applied');const current=await store.profile();assert.equal(current.version,initial.version+1);assert.equal(current.profile.reviewedPreferences[0].text,'Prefer hands-on product work and small teams.');assert.deepEqual(current.profile.strategy,initial.profile.strategy);assert.equal(current.profile.workAuthorization,initial.profile.workAuthorization);assert.notEqual(discoveryScope(current.profile),scope);
 assert.equal(jobEvaluationContext((await store.job(listing.id))!,current.profile).candidate.reviewedPreferences[0].id,f.id);assert.equal((await store.state()).requested,1);
 await assert.rejects(reviewFeedback(store,listing.id,{id:f.id,action:'apply'}),/already/);
 await removePreference(store,f.id,current.version);assert.deepEqual((await store.profile()).profile.reviewedPreferences,[]);await assert.rejects(removePreference(store,f.id,current.version),/profile changed/);
});
test('archive feedback and rejected proposals keep history without changing the profile or resurfacing jobs',async t=>{
 const store=await storeFixture(t);await store.upsert(listing);const f=await recordFeedback(store,listing.id,{reason:'This particular role has the wrong schedule.',archive:true});await reviewFeedback(store,listing.id,{id:f.id,action:'job_only'});await store.upsert(listing);assert.equal((await store.job(listing.id))?.status,'dismissed');assert.deepEqual((await store.profile()).profile.reviewedPreferences,[]);assert.equal((await store.pending(1,10)).length,0);
 const next=await recordFeedback(store,listing.id,{reason:'New feedback replaces the proposal, not its history.',archive:false});assert.equal(Number((await store.db.prepare('SELECT count(*) AS n FROM opportunity_feedback WHERE user_id=?').get(store.userId)).n),2);await assert.rejects(reviewFeedback(store,listing.id,{id:f.id,action:'apply'}),/replaced/);assert.equal((await store.job(listing.id))?.feedback?.id,next.id);
});
test('stale feedback cannot edit a changed profile and another account cannot read or apply it',async t=>{
 const accounts=await accountsFixture(t);const a=await accounts.signup({email:'feedback-a@example.test',password:'A private test password 2026'}),b=await accounts.signup({email:'feedback-b@example.test',password:'A private test password 2026'});const sa=await accounts.store(a.id),sb=await accounts.store(b.id);await sa.upsert(listing);await sb.upsert(listing);
 const f=await recordFeedback(sa,listing.id,{reason:'Prefer fewer meetings and predictable working hours.',archive:false});assert.equal((await sb.job(listing.id))?.feedback,null);await assert.rejects(reviewFeedback(sb,listing.id,{id:f.id,action:'apply'}),/replaced/);
 await sa.saveProfile({...defaultProfile,objective:'I now want a management role with more responsibility.'});await assert.rejects(reviewFeedback(sa,listing.id,{id:f.id,action:'apply'}),/profile changed/);assert.deepEqual((await sa.profile()).profile.reviewedPreferences,[]);
});
