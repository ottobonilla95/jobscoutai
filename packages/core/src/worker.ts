import { AIBudgetError } from './ai-usage';
import { verifyListing } from './verification';
import { strongMatch } from './recommendation';
import { SourceError } from './linkedin';
import { searchSources, describeJob, type SearchReport } from './sources';
import type { JobListing, Profile } from './profile';
import { rankJob } from './ranker';
import { notifyMatches } from './notifications';
import { type Store } from './store';

const defaults = { verify: verifyListing, search: searchSources as (profile: Profile) => Promise<SearchReport | JobListing[]>, describe: describeJob, rank: rankJob, notify: notifyMatches };
export async function runSearch({ store, force = false, accountId, canNotify = true, dependencies = defaults }: {
  store: Store; force?: boolean; canNotify?:boolean; accountId?:string; dependencies?: Omit<typeof defaults,'verify'> & {verify?:typeof verifyListing};
}) {
  (await store.heartbeat());
  const id = (await store.claim(force));
  if (!id) return { status: 'idle' as const };
  const started = Date.now();
  const { profile, version } = (await store.profile());
  const counts = { discovered: 0, evaluated: 0, matched: 0, inputTokens: 0, outputTokens: 0 };
  const errors: string[] = [];
  const blocked: string[] = [];
  let failed = false;
  const heartbeat = setInterval(()=>{void store.heartbeat(id).catch(()=>console.error('Worker heartbeat failed.'));},30000);
  try {
    if (profile.cvText.length < 100) throw new Error('Add your CV in Search profile before running a search.');
    if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Add AI_GATEWAY_API_KEY on the server to enable matching.');
    try {
      const result = await dependencies.search(profile);
      const listings = Array.isArray(result) ? result : result.jobs;
      if (!Array.isArray(result)) {
        errors.push(...result.errors); blocked.push(...result.blocked);
        if (!result.succeeded) failed = true;
      }
      for (const listing of listings) (await store.upsert(listing));
      counts.discovered = listings.length;
    } catch (error) {
      errors.push(error instanceof SourceError ? error.message : 'Job sources could not be reached. Check connectivity and run again later.');
      // Stop all further LinkedIn calls if this source has challenged or throttled access.
      if (error instanceof SourceError && error.stop) throw error;
    }
    for (const job of (await store.pending(version, Math.max(0,Math.min(profile.maxJobsPerRun,profile.dailyEvaluationLimit-(await store.evaluatedToday()))), profile, blocked))) {
      if (blocked.includes(job.sourceKey || 'linkedin')) continue;
      if (Date.now() - started > 8 * 60000) { errors.push('Run time budget reached. Remaining jobs will be evaluated next time.'); break; }
      (await store.heartbeat(id));
      try {
        if (!job.description) { job.description = await dependencies.describe(job.id, job); (await store.description(job.id, job.description)); }
        if (job.description.length < 50) throw new SourceError('A source returned too little description text to assess fit.');
      } catch (error) {
        errors.push(error instanceof SourceError ? error.message : 'A job description could not be fetched. It will be retried next run.');
        if (error instanceof SourceError && error.stop) blocked.push(job.sourceKey || 'linkedin');
        continue;
      }
      try {
        const result = await dependencies.rank(job, profile, accountId);
        (await store.assess(job.id, result.assessment, version));
        counts.evaluated++; counts.inputTokens += result.inputTokens; counts.outputTokens += result.outputTokens;
        job.assessment=result.assessment; job.evaluatedVersion=version;
        if(strongMatch(job,profile,version))counts.matched++;
      } catch(error) {
        errors.push(error instanceof AIBudgetError?error.message:'AI evaluation failed. Check model access, API balance, and credentials. The job is saved for retry.');
        break;
      }
      await store.progress(id,counts);
    }
    if(dependencies.verify){
      const stale=(await store.jobs()).filter(j=>j.status!=='dismissed'&&!j.duplicateOf&&(!j.verification||Date.now()-Date.parse(j.verification.checkedAt)>14*86400000)).slice(0,3);
      for(const job of stale){if(Date.now()-started>8*60000)break;(await store.verify(job.id,await dependencies.verify(job.url)));}
    }
    if((await store.evaluatedToday())>=profile.dailyEvaluationLimit)errors.push('Daily AI evaluation limit reached. Pending jobs will resume on a later run.');
    // A profile edit during a run must not send recommendations based on an obsolete profile.
    const latest = (await store.profile());
    if (latest.version === version && canNotify) {
      try { await dependencies.notify(store, latest.profile, version); }
      catch (error) { errors.push(error instanceof Error ? error.message : 'Notification failed.'); }
    }
  } catch (error) {
    failed = true;
    errors.push(error instanceof Error ? error.message : 'Search failed.');
  } finally {
    clearInterval(heartbeat);
    const status = failed ? 'failed' : errors.length ? 'partial' : 'completed';
    (await store.finish(id, status, counts, [...new Set(errors)].join(' ').slice(0,1500) || null));
  }
  return { id, status: failed ? 'failed' : errors.length ? 'partial' : 'completed', ...counts };
}
