import {createHash} from 'node:crypto';
import type {Database} from './database';
import type {Job,JobListing,Profile} from './profile';
import type {Store} from './store';
import {promisingResearch,qualifiedOpportunity} from './opportunity-selection';

const day=86400000;
export const pendingLifetimeMs=2*day;
export const dedupLifetimeMs=90*day;
export const pendingRetryMs=day;
export const pendingLimit=(profile:Profile)=>profile.maxJobsPerRun*2;
export type CleanupResult={removed:number;rejected:number;pendingRemoved:number;pendingKept:number;skipped:boolean};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

export function listingHashes(listing:JobListing){
  let url=listing.url;
  try{
    const parsed=new URL(url);parsed.hash='';
    for(const key of [...parsed.searchParams.keys()])if(/^(utm_|trk$|refId$|trackingId$)/i.test(key))parsed.searchParams.delete(key);
    parsed.searchParams.sort();url=parsed.href;
  }catch{/* Source validation handles malformed URLs; keep a stable identity here. */}
  const normalize=(value:string)=>value.trim().toLowerCase().replace(/\s+/g,' ');
  const company=normalize(listing.company);
  const named=Boolean(company)&&!/^(employer not disclosed|confidential employer|empresa confidencial|confidencial)$/.test(company);
  return {urlHash:hash(url),identityHash:named?hash(JSON.stringify([company,normalize(listing.title),normalize(listing.location)])):null};
}

export async function previouslyDiscarded(db:Database,userId:string,listing:JobListing,version:number,now:string){
  const {urlHash,identityHash}=listingHashes(listing);
  return Boolean(await db.prepare(`SELECT 1 FROM job_dedup WHERE user_id=? AND profile_version=? AND expires_at>?
    AND (retry_after IS NULL OR retry_after>?) AND (job_id=? OR url_hash=? OR (identity_hash IS NOT NULL AND identity_hash=?)) LIMIT 1`)
    .get(userId,version,now,now,listing.id,urlHash,identityHash));
}

function hasUserHistory(job:Job){
  const tracking=job.tracking;
  return job.status!=='new'||Boolean(job.feedback||job.researchRequested||job.notifiedAt)||Boolean(tracking&&(
    (tracking.stage&&tracking.stage!=='not_recorded')||
    (tracking.recommendation&&tracking.recommendation!=='automatic')||tracking.notes||tracking.nextAction||tracking.followUp));
}

/** Called inside a transaction with the profile locked, before deleting job data. */
export async function pruneJobs(store:Store,profile:Profile,version:number,now:Date):Promise<CleanupResult>{
  const timestamp=now.toISOString(),result:CleanupResult={removed:0,rejected:0,pendingRemoved:0,pendingKept:0,skipped:false};
  // Lock rows before reading history so concurrent saves/notes cannot be lost.
  const rows=await store.db.prepare('SELECT id,duplicate_reviewed FROM jobs WHERE user_id=? FOR UPDATE').all(store.userId);
  const manuallyDistinct=new Set(rows.filter(r=>r.duplicate_reviewed).map(r=>String(r.id)));
  const protectedIds=new Set([
    ...await store.reservedJobs(),
    ...(await store.db.prepare('SELECT DISTINCT job_id FROM opportunity_feedback WHERE user_id=?').all(store.userId)).map(r=>String(r.job_id)),
  ]);
  const jobs=await store.jobs(),pending:Job[]=[],discard:Array<{job:Job;reason:string;retry:boolean}>=[];
  for(const job of jobs){
    if(hasUserHistory(job)||protectedIds.has(job.id)||manuallyDistinct.has(job.id))continue;
    if(job.duplicateOf||job.verification?.status==='closed'){
      discard.push({job,reason:job.duplicateOf?'duplicate':'closed',retry:false});
    }else if(job.assessment&&job.evaluatedVersion===version){
      if(!qualifiedOpportunity(job,profile,version)&&!promisingResearch(job,profile,version))discard.push({job,reason:'not_qualified',retry:false});
    }else pending.push(job);
  }
  // Expiry uses first_seen: repeatedly rediscovering a broken listing cannot keep it forever.
  pending.sort((a,b)=>Date.parse(b.firstSeen)-Date.parse(a.firstSeen)||a.id.localeCompare(b.id));
  for(const job of pending){
    if(now.getTime()-Date.parse(job.firstSeen)>=pendingLifetimeMs)discard.push({job,reason:'pending_expired',retry:true});
    else if(result.pendingKept>=pendingLimit(profile))discard.push({job,reason:'pending_overflow',retry:true});
    else result.pendingKept++;
  }
  await store.db.prepare('DELETE FROM job_dedup WHERE user_id=? AND (profile_version!=? OR expires_at<=?)').run(store.userId,version,timestamp);
  const records=discard.map(({job,reason,retry})=>{
    const {urlHash,identityHash}=listingHashes(job);
    return {job_id:job.id,url_hash:urlHash,identity_hash:identityHash,reason,retry_after:retry?new Date(now.getTime()+pendingRetryMs).toISOString():null,expires_at:new Date(now.getTime()+dedupLifetimeMs).toISOString()};
  });
  if(records.length){
    await store.db.prepare(`INSERT INTO job_dedup(user_id,job_id,profile_version,url_hash,identity_hash,reason,retry_after,expires_at)
      SELECT ?,r.job_id,?,r.url_hash,r.identity_hash,r.reason,r.retry_after,r.expires_at
      FROM jsonb_to_recordset(?::jsonb) AS r(job_id TEXT,url_hash TEXT,identity_hash TEXT,reason TEXT,retry_after TEXT,expires_at TEXT)
      ON CONFLICT(user_id,job_id) DO UPDATE SET profile_version=excluded.profile_version,url_hash=excluded.url_hash,identity_hash=excluded.identity_hash,reason=excluded.reason,retry_after=excluded.retry_after,expires_at=excluded.expires_at`)
      .run(store.userId,version,JSON.stringify(records));
    await store.db.prepare('DELETE FROM jobs WHERE user_id=? AND id IN (SELECT jsonb_array_elements_text(?::jsonb))').run(store.userId,JSON.stringify(records.map(r=>r.job_id)));
    result.removed=records.length;result.pendingRemoved=discard.filter(r=>r.retry).length;result.rejected=records.length-result.pendingRemoved;
  }
  return result;
}
