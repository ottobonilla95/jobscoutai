import {searchTitles} from './discovery';
import { load } from 'cheerio';
import type { Job, JobListing, Profile } from './profile';
import { searchLinkedIn, fetchDescription, SourceError } from './linkedin';
import { parseBoard, sourceLabel } from './source-settings';
import { activeCountrySources, countrySources, type CountrySource } from './country-sources';
import { searchCountrySource, describeCountryJob } from './country-adapters';
import { publicData } from './source-http';
import { plainText } from './source-html';
import {searchQuery,type SearchSession} from './search-session';
import {retrySource} from './source-retry';
import {loadCompanyBoard} from './company-board';
export {parseCompanyJobs} from './company-board';
export { plainText } from './source-html';

export type SearchReport = { jobs: JobListing[]; errors: string[]; blocked: string[]; succeeded: number };
export function matchesTitle(title: string, profile: Profile) {
  const words = title.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ');
  return searchTitles(profile).some(query => query.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).every(word => words.split(' ').includes(word)));
}
export function parseYcListings(html: string): JobListing[] {
  const $=load(html);const jobs=new Map<string,JobListing>();
  $('a[href]').each((_,e)=>{
    const href=$(e).attr('href')!;let url:URL;try{url=new URL(href,'https://www.ycombinator.com');}catch{return;}
    const path=url.pathname.match(/^\/companies\/([a-z0-9-]+)\/jobs\/([a-zA-Z0-9_-]+)$/);
    if(url.origin!=='https://www.ycombinator.com'||!path)return;
    const title=$(e).text().trim();if(!title)return;
    const card=$(e).parent();
    const companyLink=card.find(`a[href="/companies/${path[1]}"]`).first();
    const company=companyLink.find('span').first().text().replace(/\s*\([^)]*\)\s*$/,'').trim()||path[1];
    const location=card.find('div.break-all').first().text().trim();
    const id=`yc:${path[1]}:${path[2]}`;
    jobs.set(id,{id,sourceKey:'yc',title,company,location,url:`${url.origin}${url.pathname}`,postedAt:null});
  });
  if(!jobs.size)throw new SourceError('Y Combinator returned no recognizable job cards; coverage is unknown.');
  return [...jobs.values()];
}
export function parseYcDescription(html: string) {
  const $=load(html);let description='';
  $('script[type="application/ld+json"]').each((_,e)=>{
    try {const data=JSON.parse($(e).text());if(data['@type']==='JobPosting'&&typeof data.description==='string')description=plainText(data.description);}catch{}
  });
  if(description.length<50)throw new SourceError('Y Combinator did not return a usable job description.');
  // The visible header carries equity, salary, and visa facts absent from JSON-LD.
  const header=$('h1').first().closest('.ycdc-card').clone();header.find('a,button,form').remove();
  return `${plainText(header.html()||'')}\n\n${description}`.slice(0,24000);
}
export async function searchYc(profile: Profile,session?:SearchSession) {
  return (await searchQuery(session,{source:'yc',query:'*',location:'',page:0},async()=>parseYcListings(await publicData('https://www.ycombinator.com/jobs/role/all','Y Combinator'))))
    .filter(job=>matchesTitle(job.title,profile) && (!profile.remoteOnly || /remote/i.test(job.location)));
}
export async function searchCompanyBoard(value: string, profile: Profile,session?:SearchSession) {
  const board=parseBoard(value);if(!board)throw new SourceError('Unsupported company board URL.',true);
  return (await searchQuery(session,{source:board.key,query:'*',location:'',page:0},()=>loadCompanyBoard(board)))
    .filter(job=>matchesTitle(job.title,profile) && (!profile.remoteOnly || /remote/i.test(job.location)));
}
export async function searchSources(profile: Profile, adapters: {
  linkedin:typeof searchLinkedIn; yc:typeof searchYc; company:typeof searchCompanyBoard;
  country?:(source:CountrySource,profile:Profile,session?:SearchSession)=>Promise<JobListing[]>;
} = { linkedin:searchLinkedIn, yc:searchYc, company:searchCompanyBoard, country:(source,profile,session)=>searchCountrySource(source,profile,undefined,session) },session?:SearchSession): Promise<SearchReport> {
  const report:SearchReport={jobs:[],errors:[],blocked:[],succeeded:0};
  const tasks: {key:string;run:()=>Promise<JobListing[]>}[]=[];
  if(profile.sources.includes('linkedin'))tasks.push({key:'linkedin',run:()=>adapters.linkedin(profile,session)});
  if(profile.sources.includes('yc'))tasks.push({key:'yc',run:()=>adapters.yc(profile,session)});
  if(profile.sources.includes('companies'))for(const value of [...new Set([...profile.companyBoards,...profile.discoveredCompanyBoards])]){
    const board=parseBoard(value);if(board&&!tasks.some(task=>task.key===board.key))tasks.push({key:board.key,run:()=>adapters.company(value,profile,session)});
  }
  for(const source of activeCountrySources(profile))tasks.push({key:source.key,run:()=>(adapters.country || ((s,p,c)=>searchCountrySource(s,p,undefined,c)))(source,profile,session)});
  for(const task of tasks){
    if(session&&(session.blocked.has(task.key)||session.remaining<=0||Date.now()>=session.deadline))continue;
    const before=session?.attempts.length||0;
    try{report.jobs.push(...await task.run());const attempts=session?.attempts.slice(before)||[];if(!attempts.length||attempts.some(a=>a.status==='ok'))report.succeeded++;}
    catch(error){if(error instanceof SourceError&&error.stop){report.blocked.push(task.key);session?.blocked.add(task.key);}report.errors.push(error instanceof SourceError?error.message:`${sourceLabel(task.key)} could not be read. Coverage is unknown; retry later.`);}
  }
  if(session)for(const attempt of session.attempts){
    if(attempt.scope?.status==='mismatch')report.errors.push(`${sourceLabel(attempt.source)} returned a different location filter. Results from that query were not used; requested coverage remains unconfirmed.`);
    if(attempt.status==='blocked'&&!report.blocked.includes(attempt.source))report.errors.push(`${attempt.location?attempt.location+': ':''}${attempt.error||'Source request failed. Coverage is unknown.'}`);
  }
  // Preserve successful queries preceding a source failure; filters still apply.
  if(session)report.jobs.push(...session.items.filter(job=>matchesTitle(job.title,profile)&&(!profile.remoteOnly||/\b(remote|remoto|teletrabajo)\b/i.test(job.location))));
  report.jobs=[...new Map(report.jobs.map(job=>[job.id,job])).values()];
  report.jobs=report.jobs.filter(job=>{
    const date=job.postedAt?Date.parse(job.postedAt):NaN;
    return Number.isNaN(date)?profile.includeUnknownDates:date>=Date.now()-profile.postedWithinDays*86400000;
  });
  return report;
}
export async function describeJob(id: string, job: Job) {
  if(!job.sourceKey||job.sourceKey==='linkedin')return fetchDescription(id);
  if(countrySources.some(source=>source.key===job.sourceKey))return retrySource(()=>describeCountryJob(id,job));
  if(job.sourceKey==='yc'){
    const parts=id.match(/^yc:([a-z0-9-]+):([a-zA-Z0-9_-]+)$/);if(!parts)throw new SourceError('Invalid Y Combinator job ID.');
    return retrySource(async()=>parseYcDescription(await publicData(`https://www.ycombinator.com/companies/${parts[1]}/jobs/${parts[2]}`,'Y Combinator')));
  }
  throw new SourceError(`${sourceLabel(job.sourceKey)} did not provide a description in its feed.`);
}
