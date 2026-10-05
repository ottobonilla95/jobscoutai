import type {SearchDiscovery} from '@core/adaptive-search-schema';
import {sourceLabel} from '@core/source-settings';
import {useI18n} from './i18n';
const stops:Record<SearchDiscovery['stopReason'],string>={
 sufficient_matches:'Found new strong matches.',round_limit:'Reached the follow-up limit.',request_budget:'Reached the source-query budget.',evaluation_budget:'Reached the evaluation budget.',time_budget:'Reached the run time budget.',profile_changed:'Your profile changed; the next run will use your updated preferences.',no_untried_queries:'No untried search approach remains in this run.',sources_unavailable:'Selected sources were unavailable.',planner_unavailable:'No additional search approach was available.',
};
export default function SearchDiscoveryReport({report}:{report:SearchDiscovery}){
 const {t}=useI18n();
 return <details className="search-discovery-report"><summary>{t('How this search adapted')}</summary>
  <p>{t(stops[report.stopReason])} {t('{count} of {limit} source queries checked.',{count:report.requests,limit:report.requestLimit})}</p>
  {report.rounds.map(round=><section key={round.round} className="discovery-round">
   <h3>{t(round.round===0?'Initial search':'Follow-up {count}',{count:round.round})}</h3>
   <p>{t(round.reason)}</p><p className="footnote">{t('New opportunities: {count}. New strong matches so far: {strong}.',{count:round.newCandidates,strong:round.strongCandidates})}</p>
   {round.boards.length>0&&<ul>{round.boards.map(url=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul>}
   {round.attempts.length>0&&<div className="discovery-table"><table><caption className="sr-only">{t('Checked search attempts')}</caption><thead><tr><th>{t('Source')}</th><th>{t('Query and location')}</th><th>{t('Page')}</th><th>{t('Results')}</th></tr></thead><tbody>{round.attempts.map((a,i)=><tr key={i}><td>{sourceLabel(a.source)}</td><td>{a.query==='*'?t('Employer job feed'):a.query}{a.location&&<small>{a.location}</small>}</td><td>{a.page+1}</td><td>{a.status==='blocked'?t('Unavailable'):a.found}</td></tr>)}</tbody></table></div>}
  </section>)}
  <p className="footnote">{t('Only the attempts listed here were checked. This is not exhaustive coverage.')}</p>
 </details>;
}
