import {searchTitles} from './discovery';
import { load } from 'cheerio';
import { z } from 'zod';
import { colombiaSearchLocations, normalizedLocation, type CountrySource, type CountrySourceKey } from './country-sources';
import type { JobListing, Profile } from './profile';
import { SourceError } from './linkedin';
import { publicData } from './source-http';
import { jsonLdObjects, plainText } from './source-html';

const origins: Record<CountrySourceKey, string> = {
  'getonbrd-co': 'https://www.getonbrd.com',
  'elempleo-co': 'https://www.elempleo.com',
  'michaelpage-co': 'https://www.michaelpage.com.co',
};
function jobUrl(key: CountrySourceKey, value: string): URL | null {
  try {
    const url = new URL(value, origins[key]);
    if (url.origin !== origins[key] || url.username || url.password) return null;
    const valid = key === 'elempleo-co' ? /^\/co\/ofertas-trabajo\/[a-z0-9-]+-\d+\/?$/i.test(url.pathname) :
      key === 'michaelpage-co' ? /^\/job-detail\/[^/]+\/ref\/jn-\d{6}-\d+\/?$/i.test(url.pathname) :
      /^\/jobs\/(?:[a-z0-9-]+\/)?[a-z0-9_-]+\/?$/i.test(url.pathname);
    if (!valid) return null;
    url.search = ''; url.hash = ''; return url;
  } catch { return null; }
}
function unavailable(label: string): never {
  throw new SourceError(`${label} returned an unrecognized search page. Coverage is unknown.`, true);
}
export function listingDate(value: string, now = Date.now()): string | null {
  const iso = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.getUTCMonth()+1 !== Number(iso[2]) || date.getUTCDate() !== Number(iso[3]) ? null : date.toISOString();
  }
  const text = normalizedLocation(value);
  if (text === 'hoy' || text === 'today') return new Date(now).toISOString();
  const relative = text.match(/^hace (\d+) (minutos?|horas?|dias?|semanas?|mes(?:es)?|anos?)$/);
  if (!relative) return null;
  // Relative labels are approximate; preserve their age instead of treating an
  // obviously old posting as undated and allowing it through the unknown-date gate.
  const units: Record<string, number> = { minuto:60000, hora:3600000, dia:86400000, semana:604800000, mes:30*86400000, ano:365*86400000 };
  const unit = relative[2] === 'meses' ? 'mes' : relative[2].replace(/s$/,'');
  return new Date(now - Number(relative[1]) * units[unit]).toISOString();
}
const locationResource = z.object({ data: z.array(z.object({
  id: z.union([z.string(),z.number()]), attributes: z.object({ name:z.string() }).optional(),
})) }).optional();
const getOnBoardSchema = z.object({
  data: z.array(z.object({ id:z.string().regex(/^[a-z0-9_-]+$/), attributes:z.object({
    title:z.string().min(1), description:z.string(), projects:z.string().nullish(),
    functions:z.string().nullish(), benefits:z.string().nullish(), desirable:z.string().nullish(),
    remote:z.boolean(), remote_modality:z.string().optional(), remote_zone:z.string().nullish(),
    countries:z.array(z.string()).optional(), published_at:z.number().int().nonnegative().nullish(),
    min_salary:z.number().nullish(), max_salary:z.number().nullish(),
    location_cities:locationResource, location_regions:locationResource, location_tenants:locationResource,
    company:z.object({data:z.object({attributes:z.object({name:z.string()})}).nullish()}).optional(),
  }) })),
});
export function parseGetOnBoardJobs(raw: unknown): JobListing[] {
  const parsed = getOnBoardSchema.safeParse(raw);
  if (!parsed.success) throw new SourceError('Get on Board returned an unrecognized search response. Coverage is unknown.', true);
  return parsed.data.data.map(({id,attributes:a}) => {
    const names = [a.location_cities,a.location_tenants,a.location_regions].flatMap(group =>
      group?.data.flatMap(place => place.attributes?.name ? [place.attributes.name] : []) || []);
    const places = [...new Set([...names,...(a.countries || []).filter(country => country !== 'Remote'),...(a.remote_zone ? [a.remote_zone] : [])])];
    const remote = a.remote && !['hybrid','no_remote'].includes(a.remote_modality || '');
    const location = [remote ? 'Remote' : a.remote_modality === 'hybrid' ? 'Hybrid' : '',...places].filter(Boolean).join(' · ');
    const description = [a.projects,a.description,a.functions,a.desirable,a.benefits].filter(Boolean).map(text => plainText(text!)).join('\n\n');
    const salary = a.min_salary != null || a.max_salary != null ?
      `\n\nAPI salary values: ${a.min_salary ?? 'unknown'} – ${a.max_salary ?? 'unknown'} (currency and pay period not supplied).` : '';
    return {id:`getonbrd-co:${id}`,sourceKey:'getonbrd-co',title:a.title,
      company:a.company?.data?.attributes.name || 'Employer not disclosed',location,
      url:`${origins['getonbrd-co']}/jobs/${id}`,postedAt:a.published_at ? new Date(a.published_at*1000).toISOString() : null,
      description:description.length >= 50 ? (description+salary).slice(0,24000) : null};
  });
}
export function parseElEmpleoJobs(html: string, now = Date.now()): JobListing[] {
  const $ = load(html); const jobs = new Map<string,JobListing>();
  $('.result-item').each((_, element) => {
    const card = $(element), anchor = card.find('.js-offer-title').first();
    const url = jobUrl('elempleo-co', anchor.attr('href') || '');
    const title = anchor.text().trim(); if (!url || !title) return;
    const number = url.pathname.match(/-(\d+)\/?$/)![1];
    const mode = card.find('.small').filter((_, e) => /Modalidad laboral/i.test($(e).find('.small-text').text()))
      .find('.text-blue-petrol-dark').first().text().trim();
    const city = card.find('.js-offer-city').first().text().trim();
    const id = `elempleo-co:${number}`;
    jobs.set(id,{id,sourceKey:'elempleo-co',title,company:card.find('.js-offer-company').first().text().trim() || 'Employer not disclosed',
      location:[city,'Colombia',mode].filter(Boolean).join(' · '),url:url.href,
      postedAt:listingDate(card.find('.js-offer-date').first().text(),now)});
  });
  if (!jobs.size && !/no encontramos (ofertas|resultados)|no se encontraron ofertas|no hay ofertas/i.test($('h1,h2,.result-list').text())) unavailable('ElEmpleo');
  return [...jobs.values()];
}
export function parseMichaelPageJobs(html: string): JobListing[] {
  const $ = load(html); const jobs = new Map<string,JobListing>();
  $('.search-job-tile').each((_, element) => {
    const card = $(element), anchor = card.find('.job-title a').first();
    const url = jobUrl('michaelpage-co', anchor.attr('href') || '');
    const title = anchor.text().trim(); if (!url || !title) return;
    const reference = url.pathname.match(/\/ref\/(jn-\d{6}-\d+)\/?$/i)![1].toLowerCase();
    const id = `michaelpage-co:${reference}`;
    const remote = card.find('.job-properties').text().match(/\b(trabajo remoto|remote work|work from home|teletrabajo)\b/i)?.[0];
    // Michael Page is the recruiter; the feed does not identify the final employer.
    jobs.set(id,{id,sourceKey:'michaelpage-co',title,company:'Employer not disclosed',
      location:[card.find('.job-location').text().trim(),remote].filter(Boolean).join(' · '),
      url:url.href,postedAt:null});
  });
  if (!jobs.size && !/no (jobs|results)|no (hay|encontramos|se encontraron) (ofertas|resultados)|0 (jobs|ofertas)/i.test($('h1,.view-empty,.view-job-search').text())) unavailable('Michael Page Colombia');
  return [...jobs.values()];
}
export function parseCountryDescription(key: CountrySourceKey, html: string): string {
  const $ = load(html);
  const posting = jsonLdObjects(html).find(object => object['@type'] === 'JobPosting');
  let description = typeof posting?.description === 'string' ? plainText(posting.description) : '';
  if (key === 'michaelpage-co') {
    const content = $('article.job-advert #job-description').first();
    description = plainText(content.html() || '');
  }
  if (description.length < 50) throw new SourceError('A source returned too little description text to assess fit.');
  if (key === 'michaelpage-co') {
    description = `Advertised through Michael Page Colombia. The final employer is not identified by name.\n\n${description}`;
  } else if (posting) {
    const details = [typeof posting.title === 'string' ? posting.title : '',
      posting.baseSalary ? `Published salary: ${JSON.stringify(posting.baseSalary)}` : '',
      posting.jobLocation ? `Published location: ${JSON.stringify(posting.jobLocation)}` : ''].filter(Boolean).join('\n');
    description = `${details}\n\n${description}`;
  }
  return description.slice(0,24000);
}
export async function describeCountryJob(id: string, job: JobListing, read = publicData) {
  const key = job.sourceKey as CountrySourceKey;
  if (!Object.hasOwn(origins,key)) throw new SourceError('Unsupported country job source.');
  const url = jobUrl(key,job.url);
  const suffix = key === 'elempleo-co' ? url?.pathname.match(/-(\d+)\/?$/)?.[1] :
    key === 'michaelpage-co' ? url?.pathname.match(/\/ref\/(jn-\d{6}-\d+)\/?$/i)?.[1].toLowerCase() : url?.pathname.split('/').filter(Boolean).at(-1);
  if (!url || id !== `${key}:${suffix}`) throw new SourceError('Invalid country job URL or ID.');
  return parseCountryDescription(key, await read(url.href,key,true));
}
export async function searchCountrySource(source: CountrySource, profile: Profile, read = publicData): Promise<JobListing[]> {
  const places=profile.searchLocations.filter(p=>p.countryCode==='CO');
  const cities=places.length?(places.some(p=>p.kind==='country')?['']:places.map(p=>p.city)):colombiaSearchLocations(profile.locations);
  if (!cities.length) return [];
  const jobs = new Map<string,JobListing>();
  const queries = new Set<string>();
  for (const title of searchTitles(profile)) for (const city of source.key === 'getonbrd-co' ? [''] : cities) {
    let url: string;
    if (source.key === 'getonbrd-co') {
      const query = new URLSearchParams({query:title,country_code:'co',per_page:'20',page:'1',lang:profile.outputLanguage,
        expand:JSON.stringify(['company','location_cities','location_tenants','location_regions'])});
      if (profile.remoteOnly) query.set('remote','true');
      url = `${origins[source.key]}/api/v0/search/jobs?${query}`;
    } else if (source.key === 'elempleo-co') {
      const slug = normalizedLocation(title).replace(/ /g,'-');
      if (!slug) continue;
      url = `${origins[source.key]}/co/ofertas-empleo/${city ? normalizedLocation(city).replace(/ /g,'-')+'/' : ''}trabajo-${slug}`;
    } else {
      url = `${origins[source.key]}/jobs?${new URLSearchParams({search:title,location:city || 'Colombia'})}`;
    }
    if (queries.has(url)) continue; queries.add(url);
    const body = await read(url,source.label,true);
    const listings = source.key === 'getonbrd-co' ? parseGetOnBoardJobs(JSON.parse(body)) :
      source.key === 'elempleo-co' ? parseElEmpleoJobs(body) : parseMichaelPageJobs(body);
    for (const listing of listings) {
      if (profile.remoteOnly && !/\b(remote|remoto|teletrabajo)\b/i.test(listing.location)) continue;
      jobs.set(listing.id,listing);
    }
  }
  return [...jobs.values()];
}
