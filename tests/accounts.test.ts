import {accountsFixture,storeFixture} from './database-fixture';
import {brand} from '../packages/core/src/brand';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Accounts,hashPassword,verifyPassword} from '../packages/core/src/accounts';
import {runScheduled} from '../packages/core/src/scheduler';
async function fixture(t:test.TestContext){return accountsFixture(t);}
const password='A long private test phrase 2026';
test('passwords use unique salted hashes and reject incorrect passwords',async()=>{
 const a=await hashPassword(password);const b=await hashPassword(password);assert.notEqual(a,b);assert.equal(a.includes(password),false);
 assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('Incorrect password!',a),false);
});
test('email normalization, duplicate signup, and login credentials are enforced',async t=>{
 const accounts=(await fixture(t));const user=await accounts.signup({email:'Person@Example.com',password});assert.equal(user.email,'person@example.com');
 assert.equal((await accounts.login('PERSON@example.com',password))?.id,user.id);assert.equal(await accounts.login(user.email,'Wrong password!'),null);
 await assert.rejects(accounts.signup({email:'person@example.com',password}));await assert.rejects(accounts.signup({email:'other@example.com',password:'short'}));
 const row=(await accounts.db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(user.id))!;assert.notEqual(row.password_hash,password);
});
test('opaque sessions are hashed, revocable, expire, and reject legacy/tampered cookies',async t=>{
 const accounts=(await fixture(t));const user=await accounts.signup({email:'person@example.com',password});const token=(await accounts.session(user));
 assert.equal((await accounts.current(token))?.id,user.id);assert.notEqual((await accounts.db.prepare('SELECT token_hash FROM sessions').get())!.token_hash,token);
 assert.equal((await accounts.current(token+'x')),null);assert.equal((await accounts.current('legacy.payload.signature')),null);
 (await accounts.revoke(token));assert.equal((await accounts.current(token)),null);
 const second=(await accounts.session(user));(await accounts.db.exec('UPDATE sessions SET expires=0'));assert.equal((await accounts.current(second)),null);
});
test('two accounts have independent profiles, identical job IDs, queues, and run histories',async t=>{
 const accounts=(await fixture(t));const a=await accounts.signup({email:'one@example.com',password});const b=await accounts.signup({email:'two@example.com',password});
 const one=(await accounts.store(a.id));const two=(await accounts.store(b.id));
 (await one.saveProfile({...(await one.profile()).profile,objective:'Find a founding role with equity',cvText:'Private CV one'}));
 (await one.upsert({id:'123',title:'One role',company:'One',location:'Remote',url:'https://www.linkedin.com/jobs/view/123/',postedAt:null}));(await one.requestRun());
 assert.equal((await two.jobs()).length,0);assert.equal((await two.profile()).profile.cvText,'');assert.equal((await two.state()).requested,0);assert.equal((await two.runs()).length,0);
 (await two.upsert({id:'123',title:'Two role',company:'Two',location:'Remote',url:'https://www.linkedin.com/jobs/view/123/',postedAt:null}));
 assert.equal((await one.jobs())[0].company,'One');assert.equal((await two.jobs())[0].company,'Two');await assert.rejects(accounts.store('../jobs.sqlite'));
 assert.doesNotMatch((await two.profile()).profile.objective,/founding/);assert.equal((await two.profile()).profile.emailEnabled,false);
});
test('scheduler dispatches each account with its own store and globally excludes overlapping scans',async t=>{
 const accounts=(await fixture(t));const a=await accounts.signup({email:'one@example.com',password});const b=await accounts.signup({email:'two@example.com',password});
 for(const user of [a,b]){const store=(await accounts.store(user.id));(await store.saveProfile({...(await store.profile()).profile,name:user.email}));(await store.requestRun());}
 const names:string[]=[];
 const run:typeof import('../packages/core/src/worker').runSearch=async({store})=>{
  names.push((await store.profile()).profile.name);const id=(await store.claim());assert.ok(id);(await store.finish(id,'completed',{discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0},null));return {status:'completed',id,discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0};
 };
 const lock=(await accounts.claimScheduler());assert.ok(lock);assert.equal((await runScheduled({accounts,run})).status,'idle');(await accounts.releaseScheduler(lock));
 await runScheduled({accounts,run});await runScheduled({accounts,run});assert.deepEqual(new Set(names),new Set([a.email,b.email]));
 assert.equal((await runScheduled({accounts,run})).status,'idle');
});
test('authentication rate limits persist across connections and expire',async t=>{
 const accounts=(await fixture(t));const second=new Accounts(accounts.db);
 assert.equal((await accounts.allow('attempt',2,60000)),true);assert.equal((await second.allow('attempt',2,60000)),true);assert.equal((await accounts.allow('attempt',2,60000)),false);
 (await accounts.db.exec('UPDATE rate_limits SET expires=0'));assert.equal((await second.allow('attempt',2,60000)),true);
});

test('account deletion requires the current password and removes every owned record without affecting another account',async t=>{
 const accounts=await fixture(t);
 const a=await accounts.signup({email:'delete@example.test',password});
 const b=await accounts.signup({email:'keep@example.test',password});
 const tokens=new Map<string,string>();
 for(const user of [a,b]){
  tokens.set(user.id,await accounts.session(user));await accounts.session(user);
  await accounts.issueToken(user,'reset');await accounts.issueToken(user,'verify');
  const store=await accounts.store(user.id);
  await store.saveProfile({... (await store.profile()).profile,cvText:'Private CV',objective:'Private objective'});
  await store.upsert({id:'job',title:'Role',company:'Company',location:'Remote',url:'https://example.test/job',postedAt:null});
  await store.enqueueDelivery('delivery',{to:[user.email],text:'Private digest'},['job']);
  await accounts.db.prepare("INSERT INTO runs(user_id,id,started_at,status) VALUES(?,'run','2026-09-28','running')").run(user.id);
  await accounts.db.prepare("INSERT INTO locks(user_id,owner,expires) VALUES(?,'worker',?)").run(user.id,Date.now()+60000);
  await accounts.db.prepare("INSERT INTO leads(user_id,id,value,created_at) VALUES(?,'lead','{}','2026-09-28')").run(user.id);
  await accounts.db.prepare("INSERT INTO ai_generations(id,user_id,kind,model,created_at,status) VALUES(?,?,'ranking','test','2026-09-28','pending')").run(user.id,user.id);
  for(const key of [`login:${user.email}`,`reset:${user.email}`,...['verify-email','strategy','verify','profile-suggestions','manual-search','delete-account'].map(prefix=>`${prefix}:${user.id}`)])await accounts.allow(key,5,60000);
 }
 await accounts.allow('login:global',100,60000);
 const tables=['sessions','account_tokens','profile','state','jobs','runs','locks','deliveries','delivery_jobs','leads','ai_generations'];
 const snapshot=async(id:string)=>Promise.all(tables.map(table=>accounts.db.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(id)));
 const beforeA=await snapshot(a.id),beforeB=await snapshot(b.id);
 assert.ok(beforeA.every(rows=>rows.length>0));
 assert.equal(await accounts.deleteAccount(a.id,'wrong password'),false);
 assert.deepEqual(await snapshot(a.id),beforeA);
 assert.ok(await accounts.current(tokens.get(a.id)));
 const staleStore=await accounts.store(a.id);
 assert.equal(await accounts.deleteAccount(a.id,password),true);
 assert.equal(await accounts.byId(a.id),null);
 assert.equal(await accounts.current(tokens.get(a.id)),null);
 assert.equal(await accounts.login(a.email,password),null);
 assert.ok((await snapshot(a.id)).every(rows=>rows.length===0));
 assert.deepEqual(await snapshot(b.id),beforeB);
 assert.equal((await accounts.current(tokens.get(b.id)))?.id,b.id);
 assert.equal(Number((await accounts.db.prepare('SELECT count(*) AS n FROM rate_limits').get()).n),9);
 await assert.rejects(staleStore.upsert({id:'late-job',title:'Role',company:'Company',location:'Remote',url:'https://example.test/late',postedAt:null}));
 await assert.rejects(accounts.session(a));
 assert.equal(await accounts.deleteAccount(a.id,password),false);
 const recreated=await accounts.signup({email:a.email,password});
 assert.notEqual(recreated.id,a.id);
 assert.equal((await (await accounts.store(recreated.id)).jobs()).length,0);
});

test('account deletion rolls back its cascade if cleanup fails',async t=>{
 const accounts=await fixture(t);const user=await accounts.signup({email:'rollback@example.test',password});
 const token=await accounts.session(user);await accounts.allow(`login:${user.email}`,10,60000);
 await accounts.db.exec("CREATE FUNCTION fail_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cleanup failed'; END $$;");
 await accounts.db.exec("CREATE TRIGGER fail_cleanup BEFORE DELETE ON rate_limits FOR EACH ROW EXECUTE FUNCTION fail_cleanup();");
 await assert.rejects(accounts.deleteAccount(user.id,password));
 assert.equal((await accounts.current(token))?.id,user.id);
 assert.ok(await (await accounts.store(user.id)).profile());
});

test('a worker with a cached email batch skips it after account deletion',async t=>{
 const {notifyMatches}=await import('../packages/core/src/notifications');
 for(const key of ['RESEND_API_KEY','EMAIL_FROM']){
  const old=process.env[key];process.env[key]='test@example.test';
  t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});
 }
 const accounts=await fixture(t);const user=await accounts.signup({email:'queued@example.test',password});
 const store=await accounts.store(user.id);const {profile,version}=await store.profile();
 await store.upsert({id:'job',title:'Role',company:'Company',location:'Remote',url:'https://example.test/job',postedAt:null});
 await store.enqueueDelivery('delivery',{to:[user.email],text:'Private digest'},['job']);
 const cached=await store.pendingDeliveries();
 store.pendingDeliveries=async()=>cached;
 await accounts.deleteAccount(user.id,password);
 let sent=0;
 assert.equal(await notifyMatches(store,{...profile,emailEnabled:true,email:user.email},version,async()=>{sent++;}),0);
 assert.equal(sent,0);
});
