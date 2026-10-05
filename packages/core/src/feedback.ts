import {randomUUID} from 'node:crypto';import {z} from 'zod';
import {Store} from './store';import {feedbackSchema,feedbackInputSchema,feedbackReviewSchema,reviewedPreferenceSchema} from './feedback-schema';
export class FeedbackConflict extends Error{}
/** Feedback is a local observation until the user explicitly reviews its scope. */
export async function recordFeedback(store:Store,jobId:string,input:z.infer<typeof feedbackInputSchema>){
 const parsed=feedbackInputSchema.parse(input);
 return store.db.transaction(async db=>{
  const scoped=new Store(db,store.userId),{version}=await scoped.profile(true);
  const job=await db.prepare('SELECT id FROM jobs WHERE user_id=? AND id=? FOR UPDATE').get(store.userId,jobId);if(!job)throw new FeedbackConflict('Job not found.');
  const feedback=feedbackSchema.parse({id:randomUUID(),reason:parsed.reason,proposedPreference:parsed.reason,status:'proposed',profileVersion:version,createdAt:new Date().toISOString()});
  await db.prepare('INSERT INTO opportunity_feedback(user_id,id,job_id,value,created_at) VALUES(?,?,?,?,?)').run(store.userId,feedback.id,jobId,JSON.stringify(feedback),feedback.createdAt);
  await db.prepare('UPDATE jobs SET feedback=?,status=CASE WHEN ? THEN ? ELSE status END WHERE user_id=? AND id=?').run(JSON.stringify(feedback),parsed.archive,'dismissed',store.userId,jobId);
  return feedback;
 });
}
export async function reviewFeedback(store:Store,jobId:string,input:z.infer<typeof feedbackReviewSchema>){
 const parsed=feedbackReviewSchema.parse(input);
 return store.db.transaction(async db=>{
  const scoped=new Store(db,store.userId),{profile,version}=await scoped.profile(true);
  const row=await db.prepare('SELECT value FROM opportunity_feedback WHERE user_id=? AND job_id=? AND id=? FOR UPDATE').get(store.userId,jobId,parsed.id);
  const job=await scoped.job(jobId);
  if(!row||job?.feedback?.id!==parsed.id)throw new FeedbackConflict('This feedback has been replaced. Refresh before reviewing it.');
  const previous=feedbackSchema.parse(JSON.parse(row.value));if(previous.status!=='proposed')throw new FeedbackConflict('This feedback has already been reviewed.');
  if(parsed.action==='apply'){
   if(previous.profileVersion!==version)throw new FeedbackConflict('Your profile changed. Save fresh feedback before applying a preference.');
   const preference=reviewedPreferenceSchema.parse({id:previous.id,text:parsed.preference||previous.proposedPreference});
   if(profile.reviewedPreferences.length>=8)throw new FeedbackConflict('Remove an old preference before adding another.');
   await scoped.saveProfile({...profile,reviewedPreferences:[...profile.reviewedPreferences,preference]});await scoped.requestRun();
  }
  const updated={...previous,proposedPreference:parsed.preference||previous.proposedPreference,status:parsed.action==='apply'?'applied' as const:'job_only' as const};
  await db.prepare('UPDATE opportunity_feedback SET value=? WHERE user_id=? AND id=?').run(JSON.stringify(updated),store.userId,parsed.id);
  await db.prepare('UPDATE jobs SET feedback=? WHERE user_id=? AND id=?').run(JSON.stringify(updated),store.userId,jobId);
  return updated;
 });
}
export async function removePreference(store:Store,id:string,expectedVersion:number){
 return store.db.transaction(async db=>{const scoped=new Store(db,store.userId),{profile,version}=await scoped.profile(true);if(version!==expectedVersion)throw new FeedbackConflict('Your profile changed. Refresh before editing preferences.');await scoped.saveProfile({...profile,reviewedPreferences:profile.reviewedPreferences.filter(p=>p.id!==id)});});
}
