import {createHash} from 'node:crypto';
import type {Profile} from './profile';
import type {DiscoveryState} from './adaptive-search-schema';
export function discoveryScope(p:Profile){return createHash('sha256').update(JSON.stringify([p.cvText,p.objective,p.goalClarifications,p.titles,p.locations,p.searchLocations,p.remoteOnly,p.workAuthorization,p.constraints,p.salaryExpectation,p.equityExpectation,p.strategy,p.sources,p.companyBoards,p.postedWithinDays,p.includeUnknownDates,p.minimumScore,p.outputLanguage])).digest('hex');}
export function freshDiscoveryState(state:DiscoveryState,now=Date.now()):DiscoveryState{
 return {...state,attempts:state.attempts.filter(a=>Date.parse(a.checkedAt)>now-7*86400000)};
}
