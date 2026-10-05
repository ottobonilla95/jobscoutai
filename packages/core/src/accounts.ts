import { Database, getDatabase } from './database';
import { defaultProfile } from './profile';
import { scrypt, randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { languagePreference, type LanguagePreference, type Locale } from './i18n/locale';
import { Store } from './store';

export const credentialsSchema = z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254)),password:z.string().min(12,'Use at least 12 characters.').max(128,'Use no more than 128 characters.')});
export type Account = { id:string; email:string };
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function derive(password:string,salt:string):Promise<Buffer>{return new Promise((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));}
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `scrypt-v1:${salt}:${(await derive(password,salt)).toString('hex')}`;}
export async function verifyPassword(password:string,encoded:string){
 const [version,salt,hash]=encoded.split(':');if(version!=='scrypt-v1'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(hash))return false;
 return timingSafeEqual(await derive(password,salt),Buffer.from(hash,'hex'));
}
export class Accounts {
 constructor(readonly db:Database=getDatabase()) {}
 async signup(input:unknown):Promise<Account>{
  const {email,password}=credentialsSchema.parse(input);const hash=await hashPassword(password);const id=randomUUID();
  // The unique constraint and initial profile are committed together.
  await this.db.transaction(async db=>{
   await db.prepare('INSERT INTO accounts(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(id,email,hash,Date.now());
   await db.prepare('INSERT INTO profile(user_id,value,version) VALUES(?,?,1)').run(id,JSON.stringify(defaultProfile));
   await db.prepare('INSERT INTO state(user_id) VALUES(?)').run(id);
  });
  return {id,email};
 }
 async login(email:string,password:string):Promise<Account|null>{
  const row=await this.db.prepare('SELECT id,email,password_hash FROM accounts WHERE email=?').get(email.trim().toLowerCase());
  // Hash unknown accounts too, avoiding a fast email-existence test.
  const fallback=`scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(128)}`;
  const valid=await verifyPassword(password,row?String(row.password_hash):fallback);
  return row&&valid?{id:String(row.id),email:String(row.email)}:null;
 }
 async session(account:Account){
  const token=randomBytes(32).toString('base64url');const now=Date.now();
  await this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
  await this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),account.id,now+7*86400000);return token;
 }
 async current(token?:string):Promise<Account|null>{
  if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const row=await this.db.prepare('SELECT a.id,a.email FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(digest(token),Date.now());
  return row?{id:String(row.id),email:String(row.email)}:null;
 }
 async revoke(token?:string){if(token)await this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
 async deleteAccount(id:string,password:string):Promise<boolean>{
  const row=await this.db.prepare('SELECT email,password_hash FROM accounts WHERE id=?').get(id);
  if(!row||!await verifyPassword(password,String(row.password_hash)))return false;
  return this.db.transaction(async db=>{
   // Match the verified hash too: a concurrent password reset invalidates this confirmation.
   // Foreign keys cascade through every account-owned table, including delivery_jobs.
   const deleted=await db.prepare('DELETE FROM accounts WHERE id=? AND password_hash=?').run(id,row.password_hash);
   if(!deleted.changes)return false;
   const keys=[`login:${row.email}`,`reset:${row.email}`,...['verify-email','strategy','verify','profile-suggestions','manual-search','delete-account','locations','research','feedback'].map(prefix=>`${prefix}:${id}`)];
   for(const key of keys)await db.prepare('DELETE FROM rate_limits WHERE key=?').run(digest(key));
   return true;
  });
 }
 async language(id:string){const row=await this.db.prepare('SELECT language,browser_language FROM accounts WHERE id=?').get(id);return {preference:languagePreference(row?.language),locale:(row?.browser_language==='es'?'es':'en') as Locale};}
 async setLanguage(id:string,preference:LanguagePreference,locale:Locale){
  await this.db.transaction(async db=>{
   const store=new Store(db,id);const {profile}=await store.profile(true);
   await db.prepare('UPDATE accounts SET language=?,browser_language=? WHERE id=?').run(preference,locale,id);
   if(profile.outputLanguage!==locale)await store.saveProfile({...profile,outputLanguage:locale});
  });
 }
 async verified(id:string){return Boolean((await this.db.prepare('SELECT verified_at FROM accounts WHERE id=?').get(id))?.verified_at);}
 async issueToken(account:Account,purpose:'reset'|'verify'){
  const token=randomBytes(32).toString('base64url');
  await this.db.prepare('INSERT INTO account_tokens(token_hash,user_id,purpose,expires) VALUES(?,?,?,?) ON CONFLICT(user_id,purpose) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires').run(digest(token),account.id,purpose,Date.now()+(purpose==='reset'?30*60000:86400000));return token;
 }
 async consumeToken(token:string,purpose:'reset'|'verify',password?:string){
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return false;
  const hash=purpose==='reset'?await hashPassword(credentialsSchema.shape.password.parse(password)):null;
  return this.db.transaction(async db=>{
   const row=await db.prepare('SELECT user_id FROM account_tokens WHERE token_hash=? AND purpose=? AND expires>? FOR UPDATE').get(digest(token),purpose,Date.now());
   if(!row)return false;
   if(hash){await db.prepare('UPDATE accounts SET password_hash=?,verified_at=COALESCE(verified_at,?) WHERE id=?').run(hash,Date.now(),row.user_id);await db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);await db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(row.user_id);}
   else{await db.prepare('UPDATE accounts SET verified_at=? WHERE id=?').run(Date.now(),row.user_id);await db.prepare('DELETE FROM account_tokens WHERE token_hash=?').run(digest(token));}
   const store=new Store(db,String(row.user_id));
   const {profile}=await store.profile();
   if(profile.emailAlertsRequested&&profile.onboardingCompleted){
     const account=await db.prepare('SELECT email FROM accounts WHERE id=?').get(row.user_id);
     await store.saveProfile({...profile,email:String(account.email),emailEnabled:true});
   }
   return true;
  });
 }
 async byId(id:string):Promise<Account|null>{const row=await this.db.prepare('SELECT id,email FROM accounts WHERE id=?').get(id);return row?{id:String(row.id),email:String(row.email)}:null;}
 async list():Promise<Account[]>{return (await this.db.prepare('SELECT id,email FROM accounts ORDER BY last_check,created_at').all()).map(row=>({id:String(row.id),email:String(row.email)}));}
 async store(id:string):Promise<Store>{
  if(!/^[a-f0-9-]{36}$/.test(id)||!await this.byId(id))throw new Error('Account not found.');
  return new Store(this.db,id);
 }
 async allow(key:string,limit:number,windowMs:number){
  const now=Date.now();
  const row=await this.db.prepare(`INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?)
   ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires<=? THEN 1 ELSE rate_limits.count+1 END,
    expires=CASE WHEN rate_limits.expires<=? THEN excluded.expires ELSE rate_limits.expires END
   WHERE rate_limits.expires<=? OR rate_limits.count<? RETURNING count`).get(digest(key),now+windowMs,now,now,now,limit);
  return Boolean(row);
 }
 async claimScheduler(){
  const owner=randomUUID();const now=Date.now();
  const result=await this.db.prepare('INSERT INTO scheduler_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE scheduler_lock.expires<=?').run(owner,now+180000,now);
  return result.changes?owner:null;
 }
 async renewScheduler(owner:string){await this.db.prepare('UPDATE scheduler_lock SET expires=? WHERE owner=?').run(Date.now()+180000,owner);}
 async releaseScheduler(owner:string){await this.db.prepare('DELETE FROM scheduler_lock WHERE owner=?').run(owner);}
}
let instance:Accounts|undefined;
export function getAccounts(){return instance??=new Accounts();}
