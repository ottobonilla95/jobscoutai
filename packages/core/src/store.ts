import { randomUUID } from 'node:crypto';
import { minimumSearchIntervalHours } from './search-policy';
import { setupDraftSchema, type SetupDraft } from './setup-schema';
import { Database, type Row } from './database';
import { profileSchema, type Profile, type Job, type JobListing, type Assessment, type Run, type Tracking, type Verification } from './profile';
import { sourceEnabled } from './source-settings';

/** Every query is scoped to the authenticated account, including joins and writes. */
export class Store {
  constructor(readonly db: Database, readonly userId: string) {}
  async profile(lock=false): Promise<{ profile: Profile; version: number }> {
    const row=await this.db.prepare(`SELECT * FROM profile WHERE user_id=?${lock?' FOR UPDATE':''}`).get(this.userId);
    if(!row)throw new Error('Account not found.');
    const profile=profileSchema.parse(JSON.parse(row.value));
    profile.intervalHours=Math.max(profile.intervalHours,minimumSearchIntervalHours());
    return {profile,version:Number(row.version)};
  }
  async saveSetupDraft(draft:SetupDraft) {
    const parsed=setupDraftSchema.parse(draft);
    await this.db.transaction(async db=>{
      const {profile}=await new Store(db,this.userId).profile(true);
      await db.prepare('UPDATE profile SET value=? WHERE user_id=?').run(JSON.stringify({...profile,setupDraft:parsed}),this.userId);
    });
  }
  async saveProfile(profile: Profile) {
    profile=profileSchema.parse({...profile,intervalHours:Math.max(profile.intervalHours,minimumSearchIntervalHours())});
    await this.db.transaction(async db=>{
      const old=await new Store(db,this.userId).profile(true);
      const fields=(p:Profile)=>JSON.stringify([p.workAuthorization,p.objective,p.cvText,p.titles,p.constraints,p.salaryExpectation,p.equityExpectation,p.remoteOnly,p.locations,p.searchLocations,p.sources,p.companyBoards,p.strategy,p.postedWithinDays,p.includeUnknownDates,p.outputLanguage]);
      await db.prepare('UPDATE profile SET value=?,version=version+? WHERE user_id=?').run(JSON.stringify(profile),fields(profile)!==fields(old.profile)?1:0,this.userId);
      if(profile.enabled&&!old.profile.enabled)await db.prepare('UPDATE state SET next_run=? WHERE user_id=?').run(new Date().toISOString(),this.userId);
      else if(profile.intervalHours!==old.profile.intervalHours)await db.prepare('UPDATE state SET next_run=? WHERE user_id=?').run(new Date(Date.now()+profile.intervalHours*3600000).toISOString(),this.userId);
    });
  }
  async state(){return (await this.db.prepare('SELECT * FROM state WHERE user_id=?').get(this.userId))!;}
  async requestRun(){await this.db.prepare('UPDATE state SET requested=1 WHERE user_id=?').run(this.userId);}
  async heartbeat(owner?:string){
    await this.db.prepare('UPDATE state SET heartbeat=? WHERE user_id=?').run(new Date().toISOString(),this.userId);
    if(owner)await this.db.prepare('UPDATE locks SET expires=? WHERE user_id=? AND owner=?').run(Date.now()+180000,this.userId,owner);
  }
  async claim(force=false):Promise<string|null>{
    return this.db.transaction(async db=>{
      // Lock the always-present profile first, just as profile edits do, then state.
      const {profile}=await new Store(db,this.userId).profile(true);
      const state=await db.prepare('SELECT * FROM state WHERE user_id=? FOR UPDATE').get(this.userId);
      const lock=await db.prepare('SELECT * FROM locks WHERE user_id=?').get(this.userId);
      if(!profile.onboardingCompleted)return null;
      const latest=await db.prepare('SELECT started_at FROM runs WHERE user_id=? ORDER BY started_at DESC LIMIT 1').get(this.userId);
      const earliest=latest?Date.parse(latest.started_at)+minimumSearchIntervalHours()*3600000:0;
      if(!force&&earliest>Date.now()){
        await db.prepare('UPDATE state SET next_run=? WHERE user_id=?').run(new Date(Math.max(earliest,state.next_run?Date.parse(state.next_run):0)).toISOString(),this.userId);
        return null;
      }
      const due=profile.enabled&&(!state.next_run||Date.parse(state.next_run)<=Date.now());
      if((lock&&Number(lock.expires)>Date.now())||(!force&&!state.requested&&!due))return null;
      const id=randomUUID(),now=new Date().toISOString();
      await db.prepare("UPDATE runs SET status='failed',finished_at=?,error='Previous worker stopped before completion.' WHERE user_id=? AND status='running'").run(now,this.userId);
      await db.prepare('INSERT INTO locks(user_id,owner,expires) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires').run(this.userId,id,Date.now()+180000);
      await db.prepare("INSERT INTO runs(user_id,id,started_at,status) VALUES(?,?,?,'running')").run(this.userId,id,now);
      await db.prepare('UPDATE state SET requested=0,next_run=? WHERE user_id=?').run(new Date(Date.now()+profile.intervalHours*3600000).toISOString(),this.userId);
      return id;
    });
  }
  async progress(id:string,counts:{discovered:number;evaluated:number;matched:number;inputTokens:number;outputTokens:number}){
    await this.db.prepare('UPDATE runs SET discovered=?,evaluated=?,matched=?,input_tokens=?,output_tokens=? WHERE user_id=? AND id=?').run(counts.discovered,counts.evaluated,counts.matched,counts.inputTokens,counts.outputTokens,this.userId,id);
  }
  async finish(id:string,status:Run['status'],counts:{discovered:number;evaluated:number;matched:number;inputTokens:number;outputTokens:number},error:string|null){
    await this.db.transaction(async db=>{
      await new Store(db,this.userId).progress(id,counts);
      await db.prepare('UPDATE runs SET finished_at=?,status=?,error=? WHERE user_id=? AND id=?').run(new Date().toISOString(),status,error,this.userId,id);
      await db.prepare('DELETE FROM locks WHERE user_id=? AND owner=?').run(this.userId,id);
    });
  }
  async upsert(listing:JobListing){
    const now=new Date().toISOString();
    await this.db.prepare(`INSERT INTO jobs(user_id,id,title,company,location,url,posted_at,first_seen,last_seen,source_key,description) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,id) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,last_seen=excluded.last_seen`)
      .run(this.userId,listing.id,listing.title,listing.company,listing.location,listing.url,listing.postedAt,now,now,listing.sourceKey||'linkedin',listing.description||null);
    // Anonymous employers on local portals cannot establish a company/title duplicate.
    const namedEmployer=Boolean(listing.company.trim())&&!/^(employer not disclosed|confidential employer|empresa confidencial|confidencial)$/i.test(listing.company.trim());
    const duplicate=await this.db.prepare('SELECT id FROM jobs WHERE user_id=? AND id!=? AND (url=? OR (? AND lower(trim(company))=lower(trim(?)) AND lower(trim(title))=lower(trim(?)) AND lower(trim(location))=lower(trim(?)))) AND duplicate_of IS NULL ORDER BY first_seen LIMIT 1').get(this.userId,listing.id,listing.url,namedEmployer,listing.company,listing.title,listing.location);
    if(duplicate)await this.db.prepare('UPDATE jobs SET duplicate_of=? WHERE user_id=? AND id=? AND duplicate_reviewed=0').run(duplicate.id,this.userId,listing.id);
  }
  async description(id:string,text:string){await this.db.prepare('UPDATE jobs SET description=? WHERE user_id=? AND id=?').run(text,this.userId,id);}
  async assess(id:string,assessment:Assessment,version:number){await this.db.prepare('UPDATE jobs SET assessment=?,score=?,evaluated_version=? WHERE user_id=? AND id=?').run(JSON.stringify(assessment),assessment.score,version,this.userId,id);}
  async track(id:string,tracking:Tracking){return (await this.db.prepare('UPDATE jobs SET tracking=? WHERE user_id=? AND id=?').run(JSON.stringify(tracking),this.userId,id)).changes;}
  async verify(id:string,verification:Verification){await this.db.prepare('UPDATE jobs SET verification=? WHERE user_id=? AND id=?').run(JSON.stringify(verification),this.userId,id);}
  async setStatus(id:string,status:Job['status']){await this.db.prepare('UPDATE jobs SET status=? WHERE user_id=? AND id=?').run(status,this.userId,id);}
  async markDistinct(id:string){await this.db.prepare('UPDATE jobs SET duplicate_of=NULL,duplicate_reviewed=1 WHERE user_id=? AND id=?').run(this.userId,id);}
  async job(id:string){const row=await this.db.prepare('SELECT * FROM jobs WHERE user_id=? AND id=?').get(this.userId,id);return row?jobFromRow(row):null;}
  async leads(){return (await this.db.prepare('SELECT * FROM leads WHERE user_id=? ORDER BY created_at DESC').all(this.userId)).map(r=>({id:String(r.id),...JSON.parse(r.value),createdAt:String(r.created_at)}));}
  async saveLead(id:string,value:unknown,existing=false){
    if(existing)return (await this.db.prepare('UPDATE leads SET value=? WHERE user_id=? AND id=?').run(JSON.stringify(value),this.userId,id)).changes;
    return (await this.db.prepare('INSERT INTO leads(user_id,id,value,created_at) VALUES(?,?,?,?)').run(this.userId,id,JSON.stringify(value),new Date().toISOString())).changes;
  }
  async evaluatedToday(){return Number((await this.db.prepare('SELECT COALESCE(SUM(evaluated),0) AS n FROM runs WHERE user_id=? AND started_at>=?').get(this.userId,new Date().toISOString().slice(0,10))).n);}
  async pending(version:number,limit:number,profile?:Profile,blocked:string[]=[]):Promise<Job[]>{
    const jobs=(await this.db.prepare("SELECT * FROM jobs WHERE user_id=? AND status!='dismissed' AND duplicate_of IS NULL AND (evaluated_version IS NULL OR evaluated_version!=?) ORDER BY last_seen DESC LIMIT ?").all(this.userId,version,profile?null:limit)).map(jobFromRow).filter(job=>(!profile||sourceEnabled(profile,job.sourceKey))&&!blocked.includes(job.sourceKey||'linkedin'));
    const groups=new Map<string,Job[]>();
    for(const job of jobs){const key=job.sourceKey||'linkedin';if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(job);}
    const selected:Job[]=[];
    while(selected.length<limit&&groups.size)for(const [key,group] of groups){if(selected.length>=limit)break;selected.push(group.shift()!);if(!group.length)groups.delete(key);}
    return selected;
  }
  async jobs():Promise<Job[]>{return (await this.db.prepare('SELECT * FROM jobs WHERE user_id=? ORDER BY score DESC NULLS LAST,first_seen DESC').all(this.userId)).map(jobFromRow);}
  async runs():Promise<Run[]>{return (await this.db.prepare('SELECT * FROM runs WHERE user_id=? ORDER BY started_at DESC LIMIT 30').all(this.userId)).map(row=>({id:String(row.id),startedAt:row.started_at,finishedAt:row.finished_at,status:row.status,discovered:Number(row.discovered),evaluated:Number(row.evaluated),matched:Number(row.matched),inputTokens:Number(row.input_tokens),outputTokens:Number(row.output_tokens),error:row.error}));}
  async deliveries(){return this.db.prepare('SELECT * FROM deliveries WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(this.userId);}
  async reservedJobs(){return (await this.db.prepare('SELECT job_id FROM delivery_jobs WHERE user_id=?').all(this.userId)).map(r=>String(r.job_id));}
  async enqueueDelivery(id:string,payload:unknown,jobIds:string[]){
    await this.db.transaction(async db=>{
      await db.prepare('INSERT INTO deliveries(user_id,id,payload,created_at) VALUES(?,?,?,?)').run(this.userId,id,JSON.stringify(payload),new Date().toISOString());
      for(const job of jobIds)await db.prepare('INSERT INTO delivery_jobs(user_id,job_id,delivery_id) VALUES(?,?,?)').run(this.userId,job,id);
    });
  }
  async pendingDeliveries(){return this.db.prepare("SELECT * FROM deliveries WHERE user_id=? AND status='pending' ORDER BY created_at LIMIT 3").all(this.userId);}
  async deliveryJobs(id:string){return (await this.db.prepare('SELECT j.* FROM jobs j JOIN delivery_jobs d ON j.user_id=d.user_id AND j.id=d.job_id WHERE d.user_id=? AND d.delivery_id=?').all(this.userId,id)).map(jobFromRow);}
  async holdDelivery(id:string,error:string){await this.db.prepare("UPDATE deliveries SET status='review',error=? WHERE user_id=? AND id=?").run(error,this.userId,id);}
  async deliveryError(id:string,error:string){await this.db.prepare('UPDATE deliveries SET error=? WHERE user_id=? AND id=?').run(error.slice(0,300),this.userId,id);}
  async sentDelivery(id:string){await this.db.transaction(async db=>{
    const now=new Date().toISOString();
    await db.prepare("UPDATE deliveries SET status='sent',sent_at=?,error=NULL WHERE user_id=? AND id=?").run(now,this.userId,id);
    await db.prepare('UPDATE jobs SET notified_at=? WHERE user_id=? AND id IN (SELECT job_id FROM delivery_jobs WHERE user_id=? AND delivery_id=?)').run(now,this.userId,this.userId,id);
  });}
}

function jobFromRow(row: Row): Job {
  return { id: String(row.id), title: String(row.title), company: String(row.company), location: String(row.location), url: String(row.url),
    tracking: row.tracking?JSON.parse(String(row.tracking)):{}, verification:row.verification?JSON.parse(String(row.verification)):null,duplicateOf:row.duplicate_of as string|null,
    sourceKey: String(row.source_key || 'linkedin'),
    postedAt: row.posted_at as string | null, description: row.description as string | null, firstSeen: String(row.first_seen), lastSeen: String(row.last_seen),
    assessment: row.assessment ? JSON.parse(String(row.assessment)) : null, status: row.status as Job['status'],
    notifiedAt: row.notified_at as string | null, evaluatedVersion: row.evaluated_version as number | null };
}
