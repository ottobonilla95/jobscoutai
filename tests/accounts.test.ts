import {brand} from '../packages/core/src/brand';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Accounts,hashPassword,verifyPassword} from '../packages/core/src/accounts';
import {runScheduled} from '../packages/core/src/scheduler';
function fixture(t:test.TestContext){const dir=mkdtempSync(join(tmpdir(),`${brand.slug}-accounts-`));const accounts=new Accounts(dir);t.after(()=>{accounts.db.close();rmSync(dir,{recursive:true,force:true});});return accounts;}
const password='A long private test phrase 2026';
test('passwords use unique salted hashes and reject incorrect passwords',async()=>{
 const a=await hashPassword(password);const b=await hashPassword(password);assert.notEqual(a,b);assert.equal(a.includes(password),false);
 assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('Incorrect password!',a),false);
});
test('email normalization, duplicate signup, and login credentials are enforced',async t=>{
 const accounts=fixture(t);const user=await accounts.signup({email:'Person@Example.com',password});assert.equal(user.email,'person@example.com');
 assert.equal((await accounts.login('PERSON@example.com',password))?.id,user.id);assert.equal(await accounts.login(user.email,'Wrong password!'),null);
 await assert.rejects(accounts.signup({email:'person@example.com',password}));await assert.rejects(accounts.signup({email:'other@example.com',password:'short'}));
 const row=accounts.db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(user.id)!;assert.notEqual(row.password_hash,password);
});
test('opaque sessions are hashed, revocable, expire, and reject legacy/tampered cookies',async t=>{
 const accounts=fixture(t);const user=await accounts.signup({email:'person@example.com',password});const token=accounts.session(user);
 assert.equal(accounts.current(token)?.id,user.id);assert.notEqual(accounts.db.prepare('SELECT token_hash FROM sessions').get()!.token_hash,token);
 assert.equal(accounts.current(token+'x'),null);assert.equal(accounts.current('legacy.payload.signature'),null);
 accounts.revoke(token);assert.equal(accounts.current(token),null);
 const second=accounts.session(user);accounts.db.exec('UPDATE sessions SET expires=0');assert.equal(accounts.current(second),null);
});
test('two accounts have independent profiles, identical job IDs, queues, and run histories',async t=>{
 const accounts=fixture(t);const a=await accounts.signup({email:'one@example.com',password});const b=await accounts.signup({email:'two@example.com',password});
 const one=accounts.store(a.id);const two=accounts.store(b.id);t.after(()=>{one.db.close();two.db.close();});
 one.saveProfile({...one.profile().profile,objective:'Find a founding role with equity',cvText:'Private CV one'});
 one.upsert({id:'123',title:'One role',company:'One',location:'Remote',url:'https://www.linkedin.com/jobs/view/123/',postedAt:null});one.requestRun();
 assert.equal(two.jobs().length,0);assert.equal(two.profile().profile.cvText,'');assert.equal(two.state().requested,0);assert.equal(two.runs().length,0);
 two.upsert({id:'123',title:'Two role',company:'Two',location:'Remote',url:'https://www.linkedin.com/jobs/view/123/',postedAt:null});
 assert.equal(one.jobs()[0].company,'One');assert.equal(two.jobs()[0].company,'Two');assert.throws(()=>accounts.store('../jobs.sqlite'));
 assert.doesNotMatch(two.profile().profile.objective,/founding/);assert.equal(two.profile().profile.emailEnabled,false);
});
test('scheduler dispatches each account with its own store and globally excludes overlapping scans',async t=>{
 const accounts=fixture(t);const a=await accounts.signup({email:'one@example.com',password});const b=await accounts.signup({email:'two@example.com',password});
 for(const user of [a,b]){const store=accounts.store(user.id);store.saveProfile({...store.profile().profile,name:user.email});store.requestRun();store.db.close();}
 const names:string[]=[];
 const run:typeof import('../packages/core/src/worker').runSearch=async({store})=>{
  names.push(store.profile().profile.name);const id=store.claim();assert.ok(id);store.finish(id,'completed',{discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0},null);return {status:'completed',id,discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0};
 };
 const lock=accounts.claimScheduler();assert.ok(lock);assert.equal((await runScheduled({accounts,run})).status,'idle');accounts.releaseScheduler(lock);
 await runScheduled({accounts,run});await runScheduled({accounts,run});assert.deepEqual(new Set(names),new Set([a.email,b.email]));
 assert.equal((await runScheduled({accounts,run})).status,'idle');
});
test('authentication rate limits persist across connections and expire',t=>{
 const accounts=fixture(t);const second=new Accounts(accounts.directory);t.after(()=>second.db.close());
 assert.equal(accounts.allow('attempt',2,60000),true);assert.equal(second.allow('attempt',2,60000),true);assert.equal(accounts.allow('attempt',2,60000),false);
 accounts.db.exec('UPDATE rate_limits SET expires=0');assert.equal(second.allow('attempt',2,60000),true);
});
