import { DatabaseSync } from 'node:sqlite';
import { scrypt, randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { dataDirectory } from './config';
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
 readonly db:DatabaseSync;
 constructor(readonly directory=dataDirectory()){
  mkdirSync(directory,{recursive:true,mode:0o700});this.db=new DatabaseSync(join(directory,'accounts.sqlite'));
  this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL,last_check INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
   CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS ai_generations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,kind TEXT NOT NULL,model TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS account_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,purpose TEXT NOT NULL,expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS scheduler_lock(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires INTEGER NOT NULL);`);
  this.db.exec('BEGIN IMMEDIATE');
  try{if(!this.db.prepare('PRAGMA table_info(accounts)').all().some(r=>r.name==='verified_at'))this.db.exec('ALTER TABLE accounts ADD COLUMN verified_at INTEGER');for(const [name,sql]of Object.entries({language:"TEXT NOT NULL DEFAULT 'auto'",browser_language:"TEXT NOT NULL DEFAULT 'en'"})){if(!this.db.prepare('PRAGMA table_info(accounts)').all().some(r=>r.name===name))this.db.exec(`ALTER TABLE accounts ADD COLUMN ${name} ${sql}`);}this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 async signup(input:unknown):Promise<Account>{
  const {email,password}=credentialsSchema.parse(input);const hash=await hashPassword(password);const id=randomUUID();
  // Unique email is enforced by SQLite even when two signups race.
  this.db.prepare('INSERT INTO accounts(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(id,email,hash,Date.now());
  return {id,email};
 }
 async login(email:string,password:string):Promise<Account|null>{
  const row=this.db.prepare('SELECT id,email,password_hash FROM accounts WHERE email=?').get(email.trim().toLowerCase());
  // Hash unknown accounts too, avoiding a fast email-existence test.
  const fallback=`scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(128)}`;
  const valid=await verifyPassword(password,row?String(row.password_hash):fallback);
  return row&&valid?{id:String(row.id),email:String(row.email)}:null;
 }
 session(account:Account){
  const token=randomBytes(32).toString('base64url');const now=Date.now();
  this.db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
  this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),account.id,now+7*86400000);return token;
 }
 current(token?:string):Account|null{
  if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  const row=this.db.prepare('SELECT a.id,a.email FROM sessions s JOIN accounts a ON a.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(digest(token),Date.now());
  return row?{id:String(row.id),email:String(row.email)}:null;
 }
 revoke(token?:string){if(token)this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));}
 language(id:string){const row=this.db.prepare('SELECT language,browser_language FROM accounts WHERE id=?').get(id);return {preference:languagePreference(row?.language),locale:(row?.browser_language==='es'?'es':'en') as Locale};}
 setLanguage(id:string,preference:LanguagePreference,locale:Locale){this.db.prepare('UPDATE accounts SET language=?,browser_language=? WHERE id=?').run(preference,locale,id);const store=this.store(id);try{const {profile}=store.profile();if(profile.outputLanguage!==locale)store.saveProfile({...profile,outputLanguage:locale});}finally{store.db.close();}}
 verified(id:string){return Boolean(this.db.prepare('SELECT verified_at FROM accounts WHERE id=?').get(id)?.verified_at);}
 issueToken(account:Account,purpose:'reset'|'verify'){
  const token=randomBytes(32).toString('base64url');
  this.db.prepare('DELETE FROM account_tokens WHERE expires<=? OR (user_id=? AND purpose=?)').run(Date.now(),account.id,purpose);
  this.db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?)').run(digest(token),account.id,purpose,Date.now()+(purpose==='reset'?30*60000:86400000));return token;
 }
 async consumeToken(token:string,purpose:'reset'|'verify',password?:string){
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return false;
  const hash=purpose==='reset'?await hashPassword(credentialsSchema.shape.password.parse(password)):null;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const row=this.db.prepare('SELECT user_id FROM account_tokens WHERE token_hash=? AND purpose=? AND expires>?').get(digest(token),purpose,Date.now());
   if(!row){this.db.exec('ROLLBACK');return false;}
   if(hash){this.db.prepare('UPDATE accounts SET password_hash=?,verified_at=COALESCE(verified_at,?) WHERE id=?').run(hash,Date.now(),row.user_id);this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);this.db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(row.user_id);}
   else{this.db.prepare('UPDATE accounts SET verified_at=? WHERE id=?').run(Date.now(),row.user_id);this.db.prepare('DELETE FROM account_tokens WHERE token_hash=?').run(digest(token));}
   this.db.exec('COMMIT');return true;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 byId(id:string):Account|null{const row=this.db.prepare('SELECT id,email FROM accounts WHERE id=?').get(id);return row?{id:String(row.id),email:String(row.email)}:null;}
 list():Account[]{return this.db.prepare('SELECT id,email FROM accounts ORDER BY last_check,created_at').all().map(row=>({id:String(row.id),email:String(row.email)}));}
 store(id:string):Store{
  if(!/^[a-f0-9-]{36}$/.test(id)||!this.byId(id))throw new Error('Account not found.');
  return new Store(join(this.directory,'users',id,'jobs.sqlite'));
 }
 allow(key:string,limit:number,windowMs:number){
  const now=Date.now();this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare('DELETE FROM rate_limits WHERE expires<=?').run(now);
   const hashed=digest(key);const row=this.db.prepare('SELECT count FROM rate_limits WHERE key=?').get(hashed);
   if(row&&Number(row.count)>=limit){this.db.exec('COMMIT');return false;}
   this.db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(hashed,now+windowMs);
   this.db.exec('COMMIT');return true;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 claimScheduler(){
  const owner=randomUUID();const now=Date.now();
  const result=this.db.prepare('INSERT INTO scheduler_lock VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE scheduler_lock.expires<=?').run(owner,now+180000,now);
  return result.changes?owner:null;
 }
 renewScheduler(owner:string){this.db.prepare('UPDATE scheduler_lock SET expires=? WHERE owner=?').run(Date.now()+180000,owner);}
 releaseScheduler(owner:string){this.db.prepare('DELETE FROM scheduler_lock WHERE owner=?').run(owner);}
}
let instance:Accounts|undefined;
export function getAccounts(){return instance??=new Accounts();}
