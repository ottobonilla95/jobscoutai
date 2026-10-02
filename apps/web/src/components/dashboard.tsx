'use client';
import {useI18n} from './i18n';
import { useCallback, useEffect, useState } from 'react';
import { Search, Activity, ArrowUpRight, ArrowRight, Bookmark, X, Clock3, Mail, CircleDot, AlertCircle } from 'lucide-react';
import type { DashboardData } from '@/lib/dashboard';
import type { Job, Profile } from '@core/profile';
import ResearchQueue from './research-queue';
import SearchProfile from './search-profile';
import { strongMatch, recommendation, recommendationLabels } from '@core/recommendation';
import TrackingEditor from './tracking-editor';
import { sourceOptions, sourceLabel } from '@core/source-settings';
import WorkspaceSidebar, {type DashboardView} from './workspace-sidebar';
import { activeCountrySources } from '@core/country-sources';

export default function Dashboard({ initial, initialView }: { initial: DashboardData; initialView?: DashboardView }) {
 const {t,locale,date,number,message:localizeMessage}=useI18n();

  const [data,setData] = useState(initial);
  const [draft,setDraft] = useState<Profile>(initial.profile);
  const [tab,setTab] = useState<DashboardView>(initialView ?? (initial.profile.cvText ? 'matches' : 'profile'));
  const [filter,setFilter] = useState('all');
  const [shown,setShown] = useState(50);
  const [sourceFilter,setSourceFilter] = useState('all');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [isError,setIsError] = useState(false);
  const [dirty,setDirty] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/dashboard');
    if (response.status === 401) { window.location.assign('/login'); return; }
    if (!response.ok) throw new Error(t("Could not refresh the dashboard."));
    setData(await response.json());
  },[]);
  useEffect(() => { const timer = setInterval(() => { refresh().catch(()=>{}); },10000); return () => clearInterval(timer); },[refresh]);
  const notify = (text: string, error = false) => { setMessage(text); setIsError(error); };
  function navigateTab(view: DashboardView) {
    setTab(view);
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.replaceState(null, '', url);
  }
  async function action(url: string, method = 'POST', body?: unknown) {
    const response = await fetch(url,{method, headers: body ? {'Content-Type':'application/json'} : undefined, body:body ? JSON.stringify(body) : undefined});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || t("Something went wrong."));
    await refresh(); return result;
  }
  function change<K extends keyof Profile>(key: K, value: Profile[K]) { setDraft(p=>({...p,[key]:value})); setDirty(true); }
  const running = data.runs.some(r=>r.status==='running');
  const workerOnline = data.state.heartbeat && Date.now()-Date.parse(data.state.heartbeat)<180000;
  const strong = data.jobs.filter(j=>strongMatch(j,data.profile,data.version));
  const saved = data.jobs.filter(j=>j.status==='saved');
  const visible = data.jobs.filter(j=>sourceFilter==='all'||(j.sourceKey||'linkedin')===sourceFilter).filter(j=>filter==='dismissed' ? j.status==='dismissed' : j.status!=='dismissed' &&
    (filter==='saved' ? j.status==='saved' : filter==='strong' ? strong.some(s=>s.id===j.id) : filter==='research'?recommendation(j)==='research':filter==='applications'?['applied','interviewing','offer'].includes(j.tracking?.stage||''):filter==='followups'?Boolean(j.tracking?.followUp&&j.tracking.followUp<=new Date().toISOString().slice(0,10)):true));
  const needsSetup = !data.profile.cvText || !data.integrations.ai;
  async function save() {
    setBusy(true);
    try {
      const profile = { ...data.profile, enabled:draft.enabled,sources:draft.sources, strategy:{...data.profile.strategy,citizenships:data.profile.strategy.citizenships.map(c=>c.trim()).filter(Boolean)}, titles: data.profile.titles.map(t=>t.trim()).filter(Boolean), locations: data.profile.locations.map(l=>l.trim()).filter(Boolean), companyBoards: [...new Set(draft.companyBoards.map(url=>url.trim()).filter(Boolean))] };
      if (!profile.locations.length) profile.locations=[''];
      await action('/api/profile','PUT',profile); setDraft(profile); setDirty(false); notify(t("Your search profile is saved."));
    } catch(e) { notify(e instanceof Error ? e.message : t("Could not save."),true); } finally { setBusy(false); }
  }
  async function setJobStatus(job: Job, status: Job['status']) {
    try { await action(`/api/jobs/${encodeURIComponent(job.id)}`,'PATCH',{status}); }
    catch(e) { notify(e instanceof Error?e.message:t("Could not update job."),true); }
  }
  return <div className="app-shell">
    <WorkspaceSidebar activeView={tab} name={data.profile.name} matchCount={strong.length} dirty={dirty} onNavigate={navigateTab} onSignOutError={text=>notify(text,true)}/>
    <main className="main-content">
      <div className="topline"><span>{t("WORKSPACE /")} {tab==='profile'?t("SEARCH PROFILE"):tab==='activity'?t("ACTIVITY"):t("OPPORTUNITIES")}</span><span className="private-badge"><span className="tiny-dot"/>{t("Your private job-search assistant")}</span></div>
      <header className="page-header"><div><span className="eyebrow">{tab==='profile'?t("THE DIRECTION IS YOURS"):tab==='activity'?t("A CLEAR VIEW OF THE WORK"):t("GOOD WORK STARTS WITH A GOOD FIT")}</span>
        <h1>{tab==='profile'?t("Search profile"):tab==='activity'?t("Behind the search."):t("Your next chapter.")}</h1><p className="muted">{tab==='profile'?t("Keep your experience and preferences up to date."):tab==='activity'?t("Search history, delivery status, and a little peace of mind."):t("Meaningful opportunities, selected around your experience and ambition.")}</p></div>
        {tab!=='profile'&&<button className="button primary" disabled={busy||running||data.state.requested} onClick={async()=>{
          setBusy(true);try{const result=await action('/api/search');notify(result.message);}catch(e){notify(e instanceof Error?e.message:t("Search could not start."),true);}finally{setBusy(false);}
        }}><Search size={16}/>{running?t("Searching…"):data.state.requested?t("Search queued"):t("Search now")}</button>}
      </header>
      {message&&<div role={isError?'alert':'status'} className={`toast ${isError?'error':''}`}><span>{localizeMessage(message)}</span><button className="icon-button" aria-label={t("Dismiss message")} onClick={()=>setMessage('')}><X size={16}/></button></div>}
      {tab==='matches'&&<>
        <section className="stats" aria-label={t("Search overview")}><Stat label={t("Strong matches")} value={number(strong.length)} note={t("Worth a closer look")} icon={<CircleDot size={18}/>}/><Stat label={t("Saved opportunities")} value={number(saved.length)} note={t("Your personal shortlist")} icon={<Bookmark size={18}/>}/><Stat label={t("Search cadence")} value={t('{count} hours',{count:number(data.profile.intervalHours)})} note={data.profile.enabled?t("Automatic searches enabled"):t("Automatic searches paused")} icon={<Clock3 size={18}/>}/></section>
        <div className="search-strip"><span className={`status-dot ${data.profile.enabled?'on':''}`}/><div><strong>{running?t("Your search is running"):data.profile.enabled?t("{productName} is on the lookout"):t("{productName} is ready when you are")}</strong><span>{data.profile.enabled?t('Next search: {date}',{date:date(data.state.nextRun)}):t("Set your preferences, then switch on scheduled searches.")}{!workerOnline?t(" · Worker not connected"):''}</span></div><button className="text-button" onClick={()=>navigateTab('profile')}>{t("Manage search")}<ArrowRight size={15}/></button></div>
        {needsSetup&&<div className="setup-banner"><div><span className="eyebrow">{t("START WITH YOU")}</span><h2>{t("A great match needs a little context.")}</h2><p>{t("Add your CV and preferences to give your search a clear direction.")}</p></div><button className="button secondary" onClick={()=>navigateTab('profile')}>{t("Complete your profile")}<ArrowRight size={16}/></button></div>}
        <div className="section-heading"><h2>{t("Your opportunities")} <span>{visible.length}</span></h2><span className="source-label">{t("Across your job sources")}</span></div>
        <div className="filter-row" role="group" aria-label={t("Filter opportunities")}>{[['all',t("All opportunities")],['strong',t("Strong matches")],['saved',t("Saved")],['research',t("Research queue")],['applications',t("Applications")],['followups',t("Follow-ups due")],['dismissed',t("Archive")]].map(([key,label])=><button key={key} className={filter===key?'filter active':'filter'} onClick={()=>setFilter(key)}>{label}</button>)}</div>
        {filter==='research'&&<ResearchQueue leads={data.leads} refresh={refresh}/>}
        <label className="source-filter">{t("Show source")}<select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}><option value="all">{t("All sources")}</option>{[...new Set(data.jobs.map(j=>j.sourceKey||'linkedin'))].map(key=><option value={key} key={key}>{sourceLabel(key)}</option>)}</select></label>
        <div className="job-list">{visible.length ? visible.slice(0,shown).map(job=><JobCard key={job.id} job={job} currentVersion={data.version} update={status=>setJobStatus(job,status)} refresh={refresh}/>) : <div className="empty-state"><div className="empty-icon"><Search size={27}/></div><h2>{filter==='saved'?t("Keep the promising ones close."):filter==='dismissed'?t("Nothing dismissed."):t("The right opportunity is worth finding.")}</h2><p>{filter==='saved'?t("Save a job to build your shortlist here."):filter==='dismissed'?t("Jobs you dismiss will appear here."):t("Your real search results will appear here, with clear reasons for each match and a direct link to the original listing.")}</p>{needsSetup&&<button className="text-button" onClick={()=>navigateTab('profile')}>{t("Set up your search")}<ArrowRight size={15}/></button>}</div>}</div>
        {visible.length>shown&&<button className="button secondary" onClick={()=>setShown(n=>n+50)}>{t('Show more opportunities ({count} remaining)',{count:number(visible.length-shown)})}</button>}
        <p className="footnote">{t("Public listings from your selected sources · Coverage varies by source · Scores guide your review; unstated details remain unknown.")}</p>
      </>}
      {tab==='profile'&&<>
        <SearchProfile profile={data.profile} minimum={data.minimumSearchIntervalHours} onSaved={async()=>{const response=await fetch('/api/dashboard');if(!response.ok)throw new Error(t('Could not refresh the dashboard.'));const next=await response.json();setData(next);setDraft(next.profile);setDirty(false);}}/>
        <details className="panel search-controls"><summary><h2>{t('Search sources and automatic searches')}</h2></summary>
          <form onSubmit={e=>{e.preventDefault();void save();}}>
          {sourceOptions.map(source=><label className="check-label" key={source.id}><input type="checkbox" checked={draft.sources.includes(source.id)} onChange={e=>change('sources',e.target.checked?[...draft.sources,source.id]:draft.sources.filter(id=>id!==source.id))}/><span>{t(source.label)}<small>{t(source.detail)}</small></span></label>)}
          {activeCountrySources(draft).length>0&&<div className="manual-sources"><strong>{t('Automatic sources for Colombia')}</strong><p>{activeCountrySources(draft).map(source=><a key={source.key} href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a>)}</p><small>{t('These sources run automatically while Colombia is included in your search locations.')}</small></div>}
          <p className="footnote">{t("LinkedIn is selected to start. Add Y Combinator if startup opportunities interest you. YC checks its recent public jobs page, not every startup opening. Your role keywords narrow these results; the same CV, location constraints, and equity goals guide matching everywhere.")}</p>
          {draft.sources.includes('companies')&&<label>{t("Company board URLs")} <span className="optional">{t("One per line, up to 5")}</span><textarea rows={3} value={draft.companyBoards.join('\n')} onChange={e=>change('companyBoards',e.target.value.split('\n'))} placeholder="https://jobs.ashbyhq.com/company\nhttps://job-boards.greenhouse.io/company"/><small>{t("Use the company's Ashby or Greenhouse board address. Only the companies listed here will be watched.")}</small></label>}
          <div className="manual-sources"><strong>{t("More places to explore")}</strong><p><a href="https://wellfound.com/jobs" target="_blank" rel="noopener noreferrer">Wellfound ↗</a><a href="https://www.indeed.com/" target="_blank" rel="noopener noreferrer">Indeed ↗</a></p><small>{t("Open manually. These portals are not connected to scheduled searches yet.")}</small></div>

            <label className="check-label"><input type="checkbox" checked={draft.enabled} onChange={e=>change('enabled',e.target.checked)}/><span>{t('Enable scheduled searches')}</span></label>
            <button className="button secondary" disabled={busy}>{t('Save search settings')}</button>
          </form>
        </details>
      </>}
      {tab==='activity'&&<>
        <div className="integration-row"><Integration label={t("AI matching")} ready={data.integrations.ai}/><Integration label={t("Email delivery")} ready={data.integrations.email}/><Integration label={t("Worker")} ready={Boolean(workerOnline)}/></div>
        <div className="panel activity-summary"><Clock3 size={20}/><div><strong>{t("Last worker check:")} {date(data.state.heartbeat)}</strong><p>{data.profile.enabled?t('Next scheduled search: {date}',{date:date(data.state.nextRun)}):t("Scheduled searches are paused.")} {data.state.requested?t("A manual search is queued."):''}</p></div></div>
        <div className="section-heading"><h2>{t("Search history")}</h2><span className="source-label">{t("Last 30 runs")}</span></div>
        {!data.runs.length?<div className="empty-state"><Activity size={27}/><h2>{t("A fresh start.")}</h2><p>{t("Every search will leave a record here, including errors and partial results.")}</p></div>:<div className="run-list">{data.runs.map(run=><article className="run-card" key={run.id}><div className="run-top"><strong>{date(run.startedAt)}</strong><span className={`pill ${run.status==='completed'?'green':run.status==='failed'?'red':'neutral'}`}>{t(run.status)}</span></div><p>{run.discovered} {t("found")} <span>·</span> {run.evaluated} {t("evaluated")} <span>·</span> {run.matched} {t("strong matches")} <span>·</span> {(run.inputTokens+run.outputTokens).toLocaleString(locale==='es'?'es-ES':'en-GB')} {t("tokens")}</p>{run.error&&<div className="run-error"><AlertCircle size={15}/>{localizeMessage(run.error)}</div>}</article>)}</div>}
        <div className="section-heading"><h2>{t("Email deliveries")}</h2></div>{!data.deliveries.length?<p className="muted">{t("No notification emails have been queued yet.")}</p>:data.deliveries.map(delivery=><div className="run-card" key={delivery.id}><div className="run-top"><span><Mail size={15}/> {date(delivery.createdAt)}</span><span className={`pill ${delivery.status==='sent'?'green':'neutral'}`}>{t(delivery.status)}</span></div>{delivery.error&&<p className="error-text">{localizeMessage(delivery.error)}</p>}</div>)}
      </>}
    </main>
  </div>;
}
function Stat({label,value,note,icon}:{label:string;value:string;note:string;icon:React.ReactNode}) { return <div className="stat-card"><div><span>{label}</span>{icon}</div><strong>{value}</strong><small>{note}</small></div>; }
function Integration({label,ready}:{label:string;ready:boolean}) {
 const {t,locale,date,number,message:localizeMessage}=useI18n();
 return <span className={`integration ${ready?'ready':''}`}><span className="tiny-dot"/>{label}<small>{ready?t("Connected"):t("Needs setup")}</small></span>; }
function JobCard({job,currentVersion,update,refresh}:{job:Job;currentVersion:number;update:(status:Job['status'])=>void;refresh:()=>Promise<void>}) {
 const {t,locale,date,number,message:localizeMessage}=useI18n();

  const a=job.assessment;const stale=job.evaluatedVersion!==currentVersion;
  return <article className="job-card"><div className="job-main"><div className="company-avatar">{job.company.slice(0,1)||'L'}</div><div className="job-content"><div className="job-company">{job.company}<span>·</span>{job.location || t("Location unspecified")}</div><a href={job.url} target="_blank" rel="noopener noreferrer" className="job-title">{job.title}<ArrowUpRight size={17}/></a>{a&&(a.language||'en')!==locale&&<p className="footnote">{t('Analysis language: {language}. New evaluations use your current language.',{language:t(a.language==='es'?'Spanish':'English')})}</p>}<p>{a?.summary || t("Waiting for the worker to read the description and evaluate fit.")}</p><div className="job-tags"><span className="pill neutral">{sourceLabel(job.sourceKey)}</span><span className="pill neutral">{t(recommendationLabels[recommendation(job)])}</span>{job.duplicateOf&&<span className="pill neutral">{t("Possible duplicate · excluded from alerts")}</span>}{a?.equityEvidence&&<span className="pill green">{t("Equity stated")}</span>}{a?.eligibility==='uncertain'&&<span className="pill neutral">{t("Eligibility to confirm")}</span>}{stale&&a&&<span className="pill neutral">{t("Profile changed · Review pending")}</span>}<span className="job-date">{t("Found")} {new Date(job.firstSeen).toLocaleDateString(locale==='es'?'es-ES':'en-GB',{timeZone:'UTC',month:'short',day:'numeric'})}</span></div></div><div className="job-score">{a?<><strong>{number(a.score)}<small>/100</small></strong><span>{t("FIT SCORE")}</span></>:<span className="pill neutral">{t("Pending")}</span>}</div></div>
    {a&&<details className="job-details"><summary>{t("Why this could fit")} <span>+</span></summary><div className="details-grid"><div><h3>{t("The match")}</h3><ul>{a.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul><h3>{t("Questions to explore")}</h3>{a.concerns.length?<ul>{a.concerns.map((r,i)=><li key={i}>{r}</li>)}</ul>:<p>{t("None flagged by the evaluator.")}</p>}</div><div><h3>{t("What the listing actually says")}</h3><dl><dt>{t("Salary")}</dt><dd>{a.salaryEvidence || t("Not specified")}</dd><dt>{t("Equity")}</dt><dd>{a.equityEvidence || t("Not specified")}</dd>{a.founderPathEvidence&&<><dt>{t("Ownership evidence")}</dt><dd>{a.founderPathEvidence}</dd></>}</dl></div></div>{job.description&&<details className="description"><summary>{t("Read the source description")}</summary><p>{job.description}</p></details>}</details>}
    <TrackingEditor job={job} refresh={refresh}/>
    <div className="job-footer"><a className="text-button" href={job.url} target="_blank" rel="noopener noreferrer">{t("View original listing")}<ArrowUpRight size={15}/></a><div>{job.status==='dismissed'?<button className="text-button muted" onClick={()=>update('new')}>{t("Restore")}</button>:<><button className={`text-button ${job.status==='saved'?'saved':'muted'}`} onClick={()=>update(job.status==='saved'?'new':'saved')}><Bookmark size={15} fill={job.status==='saved'?'currentColor':'none'}/>{job.status==='saved'?t("Saved"):t("Save")}</button><button className="icon-button" aria-label={t('Dismiss {title}',{title:job.title})} onClick={()=>update('dismissed')}><X size={17}/></button></>}</div></div>
  </article>;
}
