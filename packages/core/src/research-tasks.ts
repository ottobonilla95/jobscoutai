import {randomUUID} from 'node:crypto';import {Store} from './store';
import {researchTaskSchema,type ResearchTask} from './research-task-schema';import {ResearchMemory} from './research-memory';
import {sourceEnabled} from './source-settings';import type {ResearchDossier} from './research-memory-schema';import type {Job} from './profile';
/** A row lease protects checkpoints even when an account worker loses its lease. */
export class ResearchTasks{
 constructor(readonly store:Store){}
 async get(jobId:string,version:number,lock=false){const row=await this.store.db.prepare(`SELECT value FROM research_tasks WHERE user_id=? AND job_id=? AND profile_version=?${lock?' FOR UPDATE':''}`).get(this.store.userId,jobId,version);return row?researchTaskSchema.parse(JSON.parse(row.value)):null;}
 async ready(job:Job,version:number,now=Date.now()){
  const task=await this.get(job.id,version);if(!task)return true;
  if(task.status==='running'&&task.expiresAt!>now)return false;
  if(task.requestId!==(job.researchRequestId||null))return true;
  if(task.status==='failed'||task.status==='cancelled')return false;
  return task.status!=='waiting'||Date.parse(task.nextAttemptAt!)<=now;
 }
 async claim(job:Job,version:number,now=Date.now()){
  return this.store.db.transaction(async db=>{
   const scoped=new Store(db,this.store.userId),tasks=new ResearchTasks(scoped),current=await scoped.profile(true),live=await scoped.job(job.id);
   if(current.version!==version||!current.profile.researchEnabled||!live||live.status==='dismissed'||live.duplicateOf||live.verification?.status==='closed'||live.assessment?.eligibility==='ineligible'||live.assessment?.evaluation?.decision==='exclude'||!sourceEnabled(current.profile,live.sourceKey))return null;
   const previous=await tasks.get(job.id,version,true);if(!await tasks.ready(live,version,now))return null;
   const requestId=live.researchRequestId||null,newRequest=previous&&previous.requestId!==requestId;
   const fresh=!previous||previous.status==='completed'||previous.status==='cancelled';
   const attempts=fresh||newRequest?0:previous.attempts;if(attempts>=3){previous!.status='failed';previous!.lease=null;previous!.expiresAt=null;previous!.nextAttemptAt=null;previous!.updatedAt=new Date(now).toISOString();await tasks.write(previous!);await scoped.clearResearchRequest(job.id,previous!.requestId);return null;}
   const task=researchTaskSchema.parse({jobId:job.id,profileVersion:version,requestId,status:'running',attempts:attempts+1,lease:randomUUID(),expiresAt:now+180000,nextAttemptAt:null,updatedAt:new Date(now).toISOString(),plan:fresh?null:previous.plan,pages:fresh?[]:previous.pages,lastError:null});
   await db.prepare('INSERT INTO research_tasks(user_id,job_id,profile_version,value) VALUES(?,?,?,?) ON CONFLICT(user_id,job_id,profile_version) DO UPDATE SET value=excluded.value').run(scoped.userId,job.id,version,JSON.stringify(task));return task;
  });
 }
 private async owned(task:ResearchTask,tasks:ResearchTasks){
  const current=await tasks.store.profile(true),saved=await tasks.get(task.jobId,task.profileVersion,true),job=await tasks.store.job(task.jobId);
  return Boolean(saved&&saved.status==='running'&&saved.lease===task.lease&&saved.expiresAt!>Date.now()&&current.version===task.profileVersion&&current.profile.researchEnabled&&job&&job.status!=='dismissed'&&!job.duplicateOf&&job.verification?.status!=='closed'&&job.assessment?.eligibility!=='ineligible'&&job.assessment?.evaluation?.decision!=='exclude'&&sourceEnabled(current.profile,job.sourceKey));
 }
 private async write(task:ResearchTask){await this.store.db.prepare('UPDATE research_tasks SET value=? WHERE user_id=? AND job_id=? AND profile_version=?').run(JSON.stringify(researchTaskSchema.parse(task)),this.store.userId,task.jobId,task.profileVersion);}
 async checkpoint(task:ResearchTask,dossier?:ResearchDossier){return this.store.db.transaction(async db=>{const tasks=new ResearchTasks(new Store(db,this.store.userId));if(!await tasks.owned(task,tasks))return false;if(dossier&&!await new ResearchMemory(tasks.store).save(task.jobId,dossier,task.profileVersion))return false;task.updatedAt=new Date().toISOString();await tasks.write(task);return true;});}
 async publish(task:ResearchTask,dossier:ResearchDossier,retry:boolean){
  return this.store.db.transaction(async db=>{
   const scoped=new Store(db,this.store.userId),tasks=new ResearchTasks(scoped);if(!await tasks.owned(task,tasks))return false;
   if(!await new ResearchMemory(scoped).save(task.jobId,dossier,task.profileVersion))return false;
   task.status=retry?(task.attempts>=3?'failed':'waiting'):'completed';task.nextAttemptAt=task.status==='waiting'?new Date(Date.now()+(task.attempts===1?4:12)*3600000).toISOString():null;
   task.lastError=retry?'Research interrupted. Saved checkpoints will be resumed at the next eligible retry.':null;task.updatedAt=new Date().toISOString();task.lease=null;task.expiresAt=null;
   await tasks.write(task);
   if(task.status==='completed'||task.status==='failed')await scoped.clearResearchRequest(task.jobId,task.requestId);
   return true;
  });
 }
 async failure(task:ResearchTask,budget=false){
  return this.store.db.transaction(async db=>{
   const tasks=new ResearchTasks(new Store(db,this.store.userId));const current=await tasks.store.profile(true),saved=await tasks.get(task.jobId,task.profileVersion,true);
   if(!saved||saved.status!=='running'||saved.lease!==task.lease)return false;
   const job=await tasks.store.job(task.jobId),inactive=current.version!==task.profileVersion||!current.profile.researchEnabled||!job||job.status==='dismissed'||Boolean(job.duplicateOf)||job.verification?.status==='closed'||job.assessment?.eligibility==='ineligible'||job.assessment?.evaluation?.decision==='exclude'||!sourceEnabled(current.profile,job.sourceKey);
   task.status=inactive?'cancelled':!budget&&task.attempts>=3?'failed':'waiting';
   if(budget)task.attempts=Math.max(0,task.attempts-1);
   task.lastError=budget?'Daily AI call budget reached. Try again after midnight UTC.':'Research interrupted. Saved checkpoints will be resumed at the next eligible retry.';
   task.nextAttemptAt=task.status==='waiting'?(budget?new Date(new Date().setUTCHours(24,0,0,0)).toISOString():new Date(Date.now()+(task.attempts===1?4:12)*3600000).toISOString()):null;
   task.updatedAt=new Date().toISOString();task.lease=null;task.expiresAt=null;await tasks.write(task);if(task.status==='failed'||task.status==='cancelled')await tasks.store.clearResearchRequest(task.jobId,task.requestId);return true;
  });
 }
}
