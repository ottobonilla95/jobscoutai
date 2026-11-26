import type {SearchTrack} from './search-plan';
import { activeCountrySources, countrySources } from './country-sources';

export const sourceOptions = [
  { id: 'linkedin', label: 'LinkedIn', detail: 'Public job listings matching your titles and locations.' },
  { id: 'yc', label: 'Y Combinator', detail: 'Recent startup jobs. Titles narrow discovery; your profile guides location and equity matching.' },
  { id: 'companies', label: 'Company career pages', detail: 'Discover public vacancies across employer pages, startup platforms, recruiters and portfolios, plus saved Ashby or Greenhouse boards.' },
] as const;
export type SourceId = typeof sourceOptions[number]['id'];
export function parseBoard(value: string): { key: string; provider: 'ashby' | 'greenhouse'; slug: string; url: string } | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const provider = url.hostname === 'jobs.ashbyhq.com' ? 'ashby' :
      ['boards.greenhouse.io','job-boards.greenhouse.io'].includes(url.hostname) ? 'greenhouse' : null;
    const slug = url.pathname.match(/^\/([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\/?$/)?.[1];
    if (!provider || !slug || slug.length > 100) return null;
    return { provider, slug, key: `${provider}:${slug}`, url: `${url.origin}/${slug}` };
  } catch { return null; }
}
export function sourceLabel(key = 'linkedin') {
  if (key === 'web') return 'Web discovery';
  if (key === 'linkedin') return 'LinkedIn';
  if (key === 'yc') return 'Y Combinator';
  const local = countrySources.find(source => source.key === key);
  if (local) return local.label;
  const [provider, company] = key.split(':');
  return `${company} · ${provider === 'ashby' ? 'Ashby' : 'Greenhouse'}`;
}
export function sourceEnabled(profile: { sources: SourceId[]; companyBoards: string[]; discoveredCompanyBoards?:readonly string[]; locations?: readonly string[]; searchLocations?:readonly {countryCode:string}[];searchTracks?:SearchTrack[] }, key = 'linkedin') {
  if (key === 'web') return profile.sources.includes('companies');
  if (key === 'linkedin' || key === 'yc') return profile.sources.includes(key);
  if (countrySources.some(source => source.key === key)) return activeCountrySources(profile).some(source => source.key === key);
  return profile.sources.includes('companies') && [...profile.companyBoards,...(profile.discoveredCompanyBoards||[])].some(url => parseBoard(url)?.key === key);
}
