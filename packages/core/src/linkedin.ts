import {searchTitles} from './discovery';
import { load } from 'cheerio';
import type { JobListing, Profile } from './profile';
import {searchQuery,orderedQueries,type SearchSession} from './search-session';

export class SourceError extends Error {
  constructor(message: string, public readonly stop = false) { super(message); }
}
export function parseListings(html: string): JobListing[] {
  const $ = load(html); const jobs = new Map<string, JobListing>();
  $('.base-card, .job-search-card').each((_, element) => {
    const card = $(element);
    const href = card.find('a.base-card__full-link').attr('href');
    if (!href) return;
    let url: URL; try { url = new URL(href); } catch { return; }
    if (!['www.linkedin.com', 'linkedin.com'].includes(url.hostname)) return;
    const id = url.pathname.match(/\/jobs\/view\/(?:.*-)?(\d+)\/?$/)?.[1];
    const title = card.find('.base-search-card__title').text().trim();
    if (!id || !title) return;
    jobs.set(id, { id, title, company: card.find('.base-search-card__subtitle').text().trim(),
      location: card.find('.job-search-card__location').text().trim(),
      url: `https://www.linkedin.com/jobs/view/${id}/`, postedAt: card.find('time').attr('datetime') || null });
  });
  return [...jobs.values()];
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
  // Low request volume; stop on throttling instead of rotating identities or retrying aggressively.
  const wait = 1800 - (Date.now() - lastRequest);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequest = Date.now();
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    redirect: 'manual', signal: AbortSignal.timeout(25000) });
  if ([401,403,429,999].includes(response.status)) throw new SourceError(`LinkedIn access limited (HTTP ${response.status}). Search stopped; try again later.`, true);
  if (!response.ok) throw new SourceError(`LinkedIn request failed (HTTP ${response.status}).`, true);
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
    const results=await searchQuery(session,attempt,async()=>{
    const query = new URLSearchParams({ keywords: title, start: String(page*25), f_TPR: `r${profile.postedWithinDays*86400}`, sortBy: 'DD' });
    if (location) query.set('location', location);
    if (profile.remoteOnly) query.set('f_WT', '2');
    const html = await publicPage(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${query}`);
    const results = parseListings(html);
    if (html.trim() && !results.length && !/no results|no matching jobs|no jobs found/i.test(html)) {
      throw new SourceError('LinkedIn returned an unrecognized search page. Coverage is unknown.', true);
    }
    return results;
    });
    for (const job of results) jobs.set(job.id, job);
  }
  return [...jobs.values()];
}
export async function fetchDescription(id: string): Promise<string> {
  if (!/^\d+$/.test(id)) throw new Error('Invalid LinkedIn job ID.');
  return parseDescription(await publicPage(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`));
}
