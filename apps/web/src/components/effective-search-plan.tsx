import type {SetupAnswers} from '@core/setup-schema';
import type {ChatSettings} from '@core/search-chat-schema';
import {locationQuery} from '@core/locations';
import {trackSummary} from '@core/search-plan';
import {sourceLabel} from '@core/source-settings';
import {useI18n} from './i18n';

export default function EffectiveSearchPlan({answers:a,settings,sourceSettingsInDraft=false}:{sourceSettingsInDraft?:boolean;answers:SetupAnswers;settings:Pick<ChatSettings,'sources'|'postedWithinDays'|'includeUnknownDates'|'maxJobsPerRun'|'minimumScore'>}){
  const {t,locale}=useI18n();
  return <section className="panel" aria-label={t('Effective search plan')}>
    <h3>{t('Effective search plan')}</h3>
    {a.searchTracks.length?<ul>{a.searchTracks.map((track,i)=><li key={i}>{trackSummary(track,locale)}</li>)}</ul>:<p>{a.selectedLocations.map(locationQuery).join(' · ')} · {t(a.remotePreference==='remote'?'Remote only':'Also open to office work')}</p>}
    {!!a.preferredLocations.length&&<p>{t('Preferred cities or countries')}: {a.preferredLocations.map(locationQuery).join(' · ')}</p>}
    <p>{a.titles.split('\n').filter(Boolean).join(' · ')}</p>
    <p>{t('Search sources')}: {settings.sources.map(sourceLabel).join(' · ')}. {settings.sources.includes('companies')&&t('Company boards may be discovered automatically.')}</p>
    <p>{t('Listing age limit')}: {settings.postedWithinDays===0?t('Any age, including older live vacancies'):`${settings.postedWithinDays} ${t('days')}`} · {t(settings.includeUnknownDates?'Include unknown dates':'Exclude unknown dates')}</p>
    <p>{t('Evaluations per search')}: {settings.maxJobsPerRun} · {t('Minimum fit score')}: {settings.minimumScore}/100</p>
    <p className="footnote">{t('Goals and preferences guide fit. Explicit dealbreakers exclude conflicts. Missing facts create research questions. A promising research lead is not a confirmed strong match.')}</p>
    <p className="footnote">{t(sourceSettingsInDraft?'Save preferences to apply this entire proposed search plan.':'This preview uses your profile draft and saved source settings. Save the profile to apply its changes; save source changes in Search sources.')}</p>
  </section>;
}
