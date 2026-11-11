import {searchTitles} from './discovery';
import { load } from 'cheerio';
import type { JobListing, Profile } from './profile';
import {searchQuery,orderedQueries,type SearchSession} from './search-session';
import {SourceError,responseFailure} from './source-error';
import {retrySource} from './source-retry';
import type {SearchScope} from './adaptive-search-schema';
export {SourceError} from './source-error';
export function parseListings(html: string): JobListing[] {
  const $ = load(html); const jobs = new Map<string, JobListing>();
  $('.base-card, .job-search-card').each((_, element) => {
    const card = $(element);
    const href = card.find('a.base-card__full-link').attr('href');
    if (!href) return;
    let url: URL; try { url = new URL(href); } catch { return; }
    // Guest search returns regional hosts (co.linkedin.com, uk.linkedin.com, ...).
    // Keep output canonical while rejecting lookalike hosts and non-HTTPS links.
    if (url.protocol!=='https:'||url.username||url.password||url.port||!/^(?:(?:www|[a-z]{2})\.)?linkedin\.com$/.test(url.hostname)) return;
    const id = url.pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?$/)?.[1];
    const title = card.find('.base-search-card__title').text().trim();
    if (!id || !title) return;
    jobs.set(id, { id, title, company: card.find('.base-search-card__subtitle').text().trim(),
      location: card.find('.job-search-card__location').text().trim(),
      url: `https://www.linkedin.com/jobs/view/${id}/`, postedAt: card.find('time').attr('datetime') || null });
  });
  return [...jobs.values()];
}
/** A request parameter or a matching result is not a receipt for a search filter. */
export function observedSearchScope(html:string,requestedLocation:string,jobs:JobListing[]):SearchScope{
 const $=load(html);
 const observed=($('input[name="location"]').first().attr('value')||$('select[name="location"] option[selected]').first().text()||'').trim();
 const normalize=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 return {status:observed?(normalize(observed)===normalize(requestedLocation)?'confirmed':'mismatch'):'unconfirmed',observedLocation:observed?observed.slice(0,240):null,evidence:observed?`Returned location filter: ${observed}`.slice(0,500):null,resultLocations:[...new Set(jobs.map(j=>j.location).filter(Boolean))].slice(0,20).map(v=>v.slice(0,240))};
}
export function parseDescription(html: string): string {
  const $ = load(html);
  const content = $('.show-more-less-html__markup').first();
  content.find('script,style').remove();
  content.find('br').replaceWith('\n');
  content.find('p,li,h2,h3').each((_, e) => { $(e).prepend('\n'); });
  const text = content.text().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  if (text.length < 50) throw new SourceError('LinkedIn did not return a usable description. The job may be closed or access may be limited.');
  return text.slice(0,24000);
}
let lastRequest = 0;
async function publicPage(url: string): Promise<string> {
  // Pace every physical request, including bounded retries.
  const wait = 1800 - (Date.now() - lastRequest);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequest = Date.now();
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    redirect: 'manual', signal: AbortSignal.timeout(25000) });
  if (!response.ok) {await response.body?.cancel();throw responseFailure('LinkedIn',response);}
  const html = await response.text();
  if (/authwall|\/checkpoint\/challenge/i.test(html) && !/base-search-card__title|show-more-less-html__markup/.test(html)) {
    throw new SourceError('LinkedIn returned an access challenge. Search stopped.', true);
  }
  return html;
}
export async function searchLinkedIn(profile: Profile,session?:SearchSession): Promise<JobListing[]> {
  const jobs = new Map<string, JobListing>();
  const queries=searchTitles(profile).flatMap(query=>profile.locations.map(location=>({source:'linkedin',query,location,page:session?.page||0})));
  for (const attempt of orderedQueries(queries,session)) {
    const {query:title,location,page}=attempt;
    try{
    const results=await searchQuery(session,attempt,async()=>{
    const query = new URLSearchParams({ keywords: title, start: String(page*25), f_TPR: `r${profile.postedWithinDays*86400}`, sortBy: 'DD' });
    if (location) query.set('location', location);
    if (profile.remoteOnly) query.set('f_WT', '2');
    const html = await publicPage(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${query}`);
    const results = parseListings(html);
    if (!results.length && !/no results|no matching jobs|no jobs found/i.test(html)) {
      throw new SourceError('LinkedIn returned an unrecognized search page. Coverage is unknown.');
    }
    return {jobs:results,scope:observedSearchScope(html,location,results)};
    });
    for (const job of results) jobs.set(job.id, job);
    }catch(error){if(!session||(error instanceof SourceError&&error.stop))throw error;}
  }
  return [...jobs.values()];
}
export async function fetchDescription(id: string): Promise<string> {
  if (!/^\d+$/.test(id)) throw new Error('Invalid LinkedIn job ID.');
  return retrySource(async()=>parseDescription(await publicPage(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`)));
}
