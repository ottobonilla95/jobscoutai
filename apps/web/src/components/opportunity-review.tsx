'use client';

import {useRef, useState} from 'react';
import {ArrowLeft, ArrowUpRight, Bookmark, Building2, Check, CircleCheck, CircleHelp, Info, MapPin, MoreHorizontal, Search, Sparkles, X} from 'lucide-react';
import type {Job, Profile} from '@core/profile';
import {recommendation, recommendationLabels, strongMatch} from '@core/recommendation';
import {sourceLabel} from '@core/source-settings';
import {useI18n} from './i18n';
import TrackingEditor from './tracking-editor';
import ResearchAction from './research-action';
import ResearchDossierView from './research-dossier';
import {ResearchProgress} from './research-progress';
import OpportunityFeedback from './opportunity-feedback';
import ResearchQueue from './research-queue';
import type {DashboardData} from '@/lib/dashboard';

type Props = {
  jobs: Job[]; allJobs: Job[]; profile: Profile; version: number;
  filter: string; onFilter: (filter: string) => void;
  source: string; onSource: (source: string) => void;
  pendingJob: string | null;
  onUpdate: (job: Job, status: Job['status']) => Promise<void>;
  refresh: () => Promise<void>; leads: DashboardData['leads'];
  needsSetup: boolean; onSetup: () => void;
};

export default function OpportunityReview({jobs, allJobs, profile, version, filter, onFilter, source, onSource, pendingJob, onUpdate, refresh, leads, needsSetup, onSetup}: Props) {
  const {t, number} = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [shown, setShown] = useState(50);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const selected = jobs.find(job => job.id === selectedId) ?? jobs[0];
  const primaryFilters = ['all', 'strong', 'saved'];
  const countJobs = allJobs.filter(job => source === 'all' || (job.sourceKey || 'linkedin') === source);
  const counts = [
    countJobs.filter(job => job.status !== 'dismissed').length,
    countJobs.filter(job => strongMatch(job, profile, version)).length,
    countJobs.filter(job => job.status === 'saved').length,
  ];

  function changeFilter(value: string) {
    onFilter(value); setDetailOpen(false); setShown(50);
  }
  function selectJob(job: Job) {
    setSelectedId(job.id); setDetailOpen(true);
    // Wait for the newly selected detail to be rendered before moving keyboard focus.
    requestAnimationFrame(() => detailHeading.current?.focus());
  }

  return <section className={`review-workspace${detailOpen && selected ? ' detail-open' : ''}`} aria-label={t('Review opportunities')}>
    <div className="review-shortlist">
      <div className="review-toolbar">
        <div className="review-filters" role="group" aria-label={t('Filter opportunities')}>
          {[["all", t('All')], ["strong", t('Strong')], ["saved", t('Saved')]].map(([value, label], index) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? 'review-filter selected' : 'review-filter'} onClick={() => changeFilter(value)}>{label} <span>({number(counts[index])})</span></button>)}
        </div>
        <label className="review-source"><span className="sr-only">{t('Show source')}</span><select aria-label={t('Show source')} value={source} onChange={event => {onSource(event.target.value); setShown(50);}}><option value="all">{t('Source: All')}</option>{[...new Set(allJobs.map(job => job.sourceKey || 'linkedin'))].map(key => <option key={key} value={key}>{sourceLabel(key)}</option>)}</select></label>
        <label className="review-views" title={t('More views')}><MoreHorizontal size={20} aria-hidden="true"/><span className="sr-only">{t('More views')}</span><select aria-label={t('More views')} value={primaryFilters.includes(filter) ? '' : filter} onChange={event => {if (event.target.value) changeFilter(event.target.value);}}><option value="">{t('More views')}</option><option value="research">{t('Research queue')}</option><option value="applications">{t('Applications')}</option><option value="followups">{t('Follow-ups due')}</option><option value="dismissed">{t('Archive')}</option></select></label>
      </div>
      {!primaryFilters.includes(filter) && <p className="review-view-label">{t(filter === 'research' ? 'Research queue' : filter === 'applications' ? 'Applications' : filter === 'followups' ? 'Follow-ups due' : 'Archive')}</p>}
      <p className="sr-only" role="status">{t('{count} opportunities shown', {count: number(jobs.length)})}</p>
      {filter === 'research' && <ResearchQueue leads={leads} refresh={refresh}/>}
      {jobs.length ? <>
        <ul className="review-list" aria-label={t('Your opportunities')}>
          {jobs.slice(0, shown).map(job => {
            const isStrong = strongMatch(job, profile, version);
            return <li key={job.id}><button type="button" className={`review-row${selected?.id === job.id ? ' selected' : ''}`} aria-pressed={selected?.id === job.id} aria-controls="opportunity-detail" onClick={() => selectJob(job)}>
              <span className="review-row-heading"><strong>{job.title}</strong>{job.assessment && <span className="review-score" aria-label={t('Fit score: {score} out of 100', {score: number(job.assessment.score)})}>{number(job.assessment.score)}<span>/100</span></span>}</span>
              <span className="review-company">{job.company}</span>
              <span className="review-location"><MapPin size={15}/>{job.location || t('Location unspecified')}</span>
              <span className={`review-recommendation${isStrong ? ' strong' : ''}`}><Sparkles size={16}/>{isStrong ? t('Strong match') : t(recommendationLabels[recommendation(job)])}{job.status === 'saved' && <Bookmark size={14} aria-label={t('Saved')}/>}</span>
            </button></li>;
          })}
        </ul>
        {jobs.length > shown && <button type="button" className="button secondary review-load-more" onClick={() => setShown(value => value + 50)}>{t('Show more opportunities ({count} remaining)', {count: number(jobs.length - shown)})}</button>}
      </> : <div className="review-empty"><Search size={26}/><h2>{t(filter === 'saved' ? 'Keep the promising ones close.' : 'No opportunities in this view.')}</h2><p>{t(filter === 'saved' ? 'Save a job to build your shortlist here.' : 'Try another filter or source, or start a new search.')}</p>{needsSetup ? <button className="button secondary" onClick={onSetup}>{t('Complete your profile')}</button> : <button className="button secondary" onClick={() => {changeFilter('all'); onSource('all');}}>{t('Show all opportunities')}</button>}</div>}
    </div>
    <div id="opportunity-detail" className="review-detail">
      {selected ? <>
        <button type="button" className="text-button review-back" onClick={() => {setDetailOpen(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.review-row.selected')?.focus());}}><ArrowLeft size={17}/>{t('Back to opportunities')}</button>
        <OpportunityDetail key={selected.id} job={selected} version={version} pending={pendingJob === selected.id} onUpdate={status => onUpdate(selected, status)} refresh={refresh} headingRef={detailHeading}/>
      </> : <div className="review-detail-placeholder"><CircleHelp size={27}/><h2>{t('A little clarity for your next move.')}</h2><p>{t('Match reasons, open questions, and the original listing will appear here.')}</p></div>}
    </div>
  </section>;
}

function OpportunityDetail({job, version, pending, onUpdate, refresh, headingRef}: {
  job: Job; version: number; pending: boolean;
  onUpdate: (status: Job['status']) => Promise<void>; refresh: () => Promise<void>;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const {t, date, locale} = useI18n();
  const assessment = job.assessment;
  const stale = assessment && job.evaluatedVersion !== version;
  return <article className="opportunity-detail" aria-labelledby="selected-job-title" aria-busy={pending}>
    <header className="review-detail-header">
      <h2 id="selected-job-title" ref={headingRef} tabIndex={-1}>{job.title}</h2>
      <div className="review-job-meta"><span><Building2 size={18}/>{job.company}</span><span><MapPin size={18}/>{job.location || t('Location unspecified')}</span></div>
      <p className="review-summary">{assessment?.summary || t('This opportunity is waiting for its fit assessment.')}</p>
      <div className="review-detail-actions">
        <a className="button primary" href={job.url} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={19}/>{t('View original listing')}</a>
        {job.status === 'dismissed' ? <button type="button" className="button secondary" aria-disabled={pending} onClick={() => {if(!pending) void onUpdate('new');}}>{pending ? t('Saving…') : t('Restore')}</button> : <button type="button" className="button secondary" aria-pressed={job.status === 'saved'} aria-disabled={pending} onClick={() => {if(!pending) void onUpdate(job.status === 'saved' ? 'new' : 'saved');}}><Bookmark size={17} fill={job.status === 'saved' ? 'currentColor' : 'none'}/>{pending ? t('Saving…') : job.status === 'saved' ? t('Saved') : t('Save')}</button>}
      </div>
      {stale && <p className="review-notice"><Info size={16}/>{t('Profile changed · Review pending')}</p>}
      {job.duplicateOf && <p className="review-notice">{t('Possible duplicate · excluded from alerts')}</p>}
      {assessment && (assessment.language || 'en') !== locale && <p className="footnote">{t('Analysis language: {language}. New evaluations use your current language.', {language: t(assessment.language === 'es' ? 'Spanish' : 'English')})}</p>}
    </header>
    <section className="review-detail-section"><h3><CircleCheck size={21}/>{t('Why it fits')}</h3>{assessment?.reasons.length ? <ul className="review-reasons">{assessment.reasons.map((reason, index) => <li key={index}><Check size={16}/><span>{reason}</span></li>)}</ul> : <p className="muted">{t('Match reasons will appear after evaluation.')}</p>}</section>
    <section className="review-detail-section"><h3><CircleHelp size={21}/>{t('To confirm')}</h3>{assessment?.concerns.length ? <ul className="review-concerns">{assessment.concerns.map((concern, index) => <li key={index}>{concern}</li>)}</ul> : <p className="muted">{t(assessment ? 'None flagged by the evaluator.' : 'Details have not been evaluated yet.')}</p>}{assessment?.eligibility === 'uncertain' && <p className="footnote">{t('Eligibility to confirm')}</p>}</section>
    <section className="review-detail-section"><h3><Info size={21}/>{t('Key details')}</h3><dl className="review-facts"><dt>{t('Salary')}</dt><dd>{assessment?.salaryEvidence || t('Not specified')}</dd><dt>{t('Equity')}</dt><dd>{assessment?.equityEvidence || t('Not specified')}</dd><dt>{t('Source')}</dt><dd>{sourceLabel(job.sourceKey)}</dd><dt>{t('Found')}</dt><dd>{date(job.firstSeen, false)}</dd>{assessment?.founderPathEvidence && <><dt>{t('Ownership evidence')}</dt><dd>{assessment.founderPathEvidence}</dd></>}</dl></section>
    <TrackingEditor job={job} refresh={refresh}/>
    <details className="review-research"><summary>{t('Research and evidence')}</summary><ResearchProgress job={job}/><ResearchDossierView dossier={job.research} currentVersion={version}/><ResearchAction job={job} refresh={refresh}/>{job.description && <details className="description"><summary>{t('Read the source description')}</summary><p>{job.description}</p></details>}</details>
    <OpportunityFeedback job={job} refresh={refresh}/>
    {job.status !== 'dismissed' && <div className="review-archive"><button type="button" className="text-button muted" disabled={pending} onClick={() => void onUpdate('dismissed')}><X size={16}/>{t('Archive opportunity')}</button></div>}
    <p className="review-disclaimer">{t('Scores guide your review; unstated details remain unknown.')}</p>
  </article>;
}
