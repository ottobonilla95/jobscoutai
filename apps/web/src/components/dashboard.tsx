'use client';
import {useI18n} from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Activity, ArrowRight, X, Clock3, Mail, AlertCircle, SlidersHorizontal } from 'lucide-react';
import type { DashboardData } from '@/lib/dashboard';
import type { Job, Profile } from '@core/profile';
import {ResearchRunReport} from './research-progress';
import ReviewedPreferences from './reviewed-preferences';
import SearchDiscoveryReport from './search-discovery-report';
import SearchProfile from './search-profile';
import SearchChat from './search-chat';
import {opportunitiesForView} from '@core/opportunity-selection';
import OpportunityReview from './opportunity-review';
import { sourceOptions, sourceLabel } from '@core/source-settings';
import WorkspaceSidebar, {type DashboardView} from './workspace-sidebar';
import { activeCountrySources } from '@core/country-sources';
import { workerCheckedRecently } from '@core/worker-status';

export default function Dashboard({ initial, initialView }: { initial: DashboardData; initialView?: DashboardView }) {
 const {t,locale,date,number,message:localizeMessage}=useI18n();

  const [data,setData] = useState(initial);
  const [draft,setDraft] = useState<Profile>(initial.profile);
  const [tab,setTab] = useState<DashboardView>(initialView ?? 'matches');
  const [filter,setFilter] = useState('all');
  const [sourceFilter,setSourceFilter] = useState('all');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [isError,setIsError] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [assistantVisible,setAssistantVisible] = useState(false);
  const [assistantOpened,setAssistantOpened] = useState(false);
  const [pendingJob,setPendingJob] = useState<string|null>(null);
  const pendingJobRef = useRef(false);
  const [refreshError,setRefreshError] = useState(false);
  const [undo,setUndo] = useState<{job:Job;status:Job['status']}|null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/dashboard');
    if (response.status === 401) { window.location.assign('/login'); return; }
    if (!response.ok) throw new Error(t("Could not refresh the dashboard."));
    setData(await response.json());
    setRefreshError(false);
  },[locale]);
  useEffect(() => { const timer = setInterval(() => { refresh().catch(()=>setRefreshError(true)); },10000); return () => clearInterval(timer); },[refresh]);
  useEffect(()=>{if(!dirty)setDraft(data.profile);},[data.profile,dirty]);
  const notify = (text: string, error = false) => { setMessage(text); setIsError(error); };
  function navigateTab(view: DashboardView) {
    setTab(view);
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    window.history.replaceState(null, '', url);
  }
  async function action(url: string, method = 'POST', body?: unknown) {
    const response = await fetch(url,{method, headers: body ? {'Content-Type':'application/json'} : undefined, body:body ? JSON.stringify(body) : undefined});
    const result = await response.json().catch(()=>({error:t("Something went wrong.")}));
    if (!response.ok) throw new Error(result.error || t("Something went wrong."));
    await refresh(); return result;
  }
  function change<K extends keyof Profile>(key: K, value: Profile[K]) { setDraft(p=>({...p,[key]:value})); setDirty(true); }
  const running = data.runs.some(r=>r.status==='running');
  const workerOnline = workerCheckedRecently(data.state.heartbeat);
  const strong = opportunitiesForView(data.jobs,data.profile,data.version,'all');
  const visible = opportunitiesForView(data.jobs,data.profile,data.version,filter,sourceFilter);
  const matchingFailed = Boolean(data.runs[0]?.error?.includes('AI evaluation failed'));
  const needsSetup = !data.profile.cvText || !data.integrations.ai;
  async function save() {
    setBusy(true);
    try {
      const profile = { ...data.profile, enabled:draft.enabled,researchEnabled:draft.researchEnabled,sources:draft.sources, strategy:{...data.profile.strategy,citizenships:data.profile.strategy.citizenships.map(c=>c.trim()).filter(Boolean)}, titles: data.profile.titles.map(t=>t.trim()).filter(Boolean), locations: data.profile.locations.map(l=>l.trim()).filter(Boolean), companyBoards: [...new Set(draft.companyBoards.map(url=>url.trim()).filter(Boolean))] };
      if (!profile.locations.length) profile.locations=[''];
      await action('/api/profile','PUT',profile); setDraft(profile); setDirty(false); notify(t("Your search profile is saved."));
    } catch(e) { notify(e instanceof Error ? e.message : t("Could not save."),true); } finally { setBusy(false); }
  }
  async function setJobStatus(job: Job, status: Job['status']) {
    if (pendingJobRef.current) return;
    pendingJobRef.current=true; setPendingJob(job.id);
    try {
      const response=await fetch(`/api/jobs/${encodeURIComponent(job.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
      const result=await response.json().catch(()=>({error:t('Could not update job.')}));
      if(!response.ok)throw new Error(result.error||t('Could not update job.'));
      setData(current=>({...current,jobs:current.jobs.map(item=>item.id===job.id?{...item,status}:item)}));
      setUndo(status==='dismissed'?{job,status:job.status}:null);
      notify(t(status==='dismissed'?'Opportunity archived.':status==='saved'?'Opportunity saved.':job.status==='dismissed'?'Opportunity restored.':'Removed from saved opportunities.'));
      await refresh().catch(()=>setRefreshError(true));
    } catch(e) { notify(e instanceof Error?e.message:t('Could not update job.'),true); }
    finally {pendingJobRef.current=false;setPendingJob(null);}
  }
  return <div className="app-shell review-shell">
    <a className="review-skip" href="#workspace-main">{t('Skip to content')}</a>
    <WorkspaceSidebar activeView={tab} name={data.profile.name} matchCount={strong.length} dirty={dirty} onNavigate={navigateTab} onSignOutError={text=>notify(text,true)}/>
    <main id="workspace-main" className="main-content">
      {tab==='matches'?<header className="review-header"><div><h1>{t('Review opportunities')}</h1><p>{data.runs[0]?t('Latest search: {date}',{date:date(data.runs[0].startedAt)}):t('Your next move starts with a good fit.')}</p></div><div className="review-header-actions"><button type="button" className="button secondary" aria-expanded={assistantVisible} aria-controls="search-assistant-panel" onClick={()=>{setAssistantOpened(true);setAssistantVisible(value=>!value);}}><SlidersHorizontal size={17}/>{t('Refine search')}</button><button type="button" className="button primary" disabled={busy||running||data.state.requested} onClick={async()=>{setBusy(true);try{const result=await action('/api/search');notify(result.message);}catch(error){notify(error instanceof Error?error.message:t('Search could not start.'),true);}finally{setBusy(false);}}}><Search size={18}/>{running?t('Searching…'):data.state.requested?t('Search queued'):t('Search now')}</button></div></header>:<>
      <header className="review-header"><div>
        <h1>{tab==='profile'?t("Search profile"):t("Activity")}</h1><p>{tab==='profile'?t("Keep your experience and preferences up to date."):t("Search history, delivery status, and a little peace of mind.")}</p></div>
        {tab!=='profile'&&<button className="button primary" disabled={busy||running||data.state.requested} onClick={async()=>{
          setBusy(true);try{const result=await action('/api/search');notify(result.message);}catch(e){notify(e instanceof Error?e.message:t("Search could not start."),true);}finally{setBusy(false);}
        }}><Search size={16}/>{running?t("Searching…"):data.state.requested?t("Search queued"):t("Search now")}</button>}
      </header>
      </>}
      {message&&<div role={isError?'alert':'status'} className={`toast ${isError?'error':''}`}><span>{localizeMessage(message)}</span>{undo&&!isError&&<button type="button" className="text-button" disabled={pendingJob!==null} onClick={()=>void setJobStatus(undo.job,undo.status)}>{t('Undo')}</button>}<button className="icon-button" aria-label={t("Dismiss message")} onClick={()=>setMessage('')}><X size={16}/></button></div>}
      {refreshError&&<div className="review-service-notice" role="alert"><AlertCircle size={18}/><div><strong>{t('Results could not be refreshed.')}</strong><p>{t('Your current results are still here. Check your connection and try again.')}</p></div><button type="button" className="text-button" onClick={()=>void refresh().catch(()=>setRefreshError(true))}>{t('Try again')}</button></div>}
      <div hidden={tab!=='matches'}>
        <aside id="search-assistant-panel" className="review-assistant" hidden={!assistantVisible}>{assistantOpened&&<><div className="review-assistant-top"><button type="button" className="text-button" onClick={()=>{setAssistantVisible(false);document.querySelector<HTMLButtonElement>('[aria-controls="search-assistant-panel"]')?.focus();}}><X size={16}/>{t('Close assistant')}</button></div><SearchChat profileKey={JSON.stringify({...data.profile,discoveredCompanyBoards:[]})} onSaved={refresh}/></>}</aside>
        {needsSetup&&<div className="review-service-notice"><AlertCircle size={18}/><div><strong>{t('A great match needs a little context.')}</strong><p>{t('Add your CV and preferences to give your search a clear direction.')}</p></div><button type="button" className="text-button" onClick={()=>navigateTab('profile')}>{t('Complete your profile')}<ArrowRight size={15}/></button></div>}
        {(data.profile.enabled||data.state.requested)&&!workerOnline&&<div className="review-service-notice" role="status"><AlertCircle size={18}/><div><strong>{t('Search is waiting for a connection.')}</strong><p>{t('Your results are saved. New searches will resume when the search service reconnects.')}{data.state.requested?' '+t('Your manual search is still queued.'):''}</p></div><button type="button" className="text-button" onClick={()=>navigateTab('activity')}>{t('View search status')}<ArrowRight size={15}/></button></div>}
        {matchingFailed&&<div className="review-service-notice" role="status"><AlertCircle size={18}/><div><strong>{t('Matching could not finish.')}</strong><p>{t('Unchecked listings stay out of your shortlist. See Activity for the search status.')}</p></div><button type="button" className="text-button" onClick={()=>navigateTab('activity')}>{t('View search status')}<ArrowRight size={15}/></button></div>}
        <OpportunityReview jobs={visible} allJobs={data.jobs} profile={data.profile} version={data.version} filter={filter} onFilter={setFilter} source={sourceFilter} onSource={setSourceFilter} pendingJob={pendingJob} onUpdate={setJobStatus} refresh={refresh} leads={data.leads} needsSetup={needsSetup} onSetup={()=>navigateTab('profile')}/>
      </div>
      {tab==='profile'&&<>
        <SearchProfile profile={data.profile} minimum={data.minimumSearchIntervalHours} onSaved={async()=>{const response=await fetch('/api/dashboard');if(!response.ok)throw new Error(t('Could not refresh the dashboard.'));const next=await response.json();setData(next);setDraft(next.profile);setDirty(false);}}/>
        <details className="panel search-controls"><summary><h2>{t('Search sources and automatic searches')}</h2></summary>
          <form onSubmit={e=>{e.preventDefault();void save();}}>
          {sourceOptions.map(source=><label className="check-label" key={source.id}><input type="checkbox" checked={draft.sources.includes(source.id)} onChange={e=>change('sources',e.target.checked?[...draft.sources,source.id]:draft.sources.filter(id=>id!==source.id))}/><span>{t(source.label)}<small>{t(source.detail)}</small></span></label>)}
          {activeCountrySources(draft).length>0&&<div className="manual-sources"><strong>{t('Automatic sources for Colombia')}</strong><p>{activeCountrySources(draft).map(source=><a key={source.key} href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</a>)}</p><small>{t('These sources run automatically while Colombia is included in your search locations.')}</small></div>}
          <p className="footnote">{t("LinkedIn is selected to start. Add Y Combinator if startup opportunities interest you. YC checks its recent public jobs page, not every startup opening. Your role keywords narrow these results; the same CV, location constraints, and equity goals guide matching everywhere.")}</p>
          {draft.sources.includes('companies')&&<label>{t("Company board URLs")} <span className="optional">{t("One per line, up to 5")}</span><textarea rows={3} value={draft.companyBoards.join('\n')} onChange={e=>change('companyBoards',e.target.value.split('\n'))} placeholder="https://jobs.ashbyhq.com/company\nhttps://job-boards.greenhouse.io/company"/><small>{t("Use the company's Ashby or Greenhouse board address. Adaptive searches can discover additional employer boards when this source is enabled.")}</small></label>}
          {draft.sources.includes('companies')&&data.profile.discoveredCompanyBoards.length>0&&<div className="discovered-employers"><strong>{t('Employers found by the agent')}</strong><ul>{data.profile.discoveredCompanyBoards.map(url=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul></div>}
          <div className="manual-sources"><strong>{t("More places to explore")}</strong><p><a href="https://wellfound.com/jobs" target="_blank" rel="noopener noreferrer">Wellfound ↗</a><a href="https://www.indeed.com/" target="_blank" rel="noopener noreferrer">Indeed ↗</a></p><small>{t("Open manually. These portals are not connected to scheduled searches yet.")}</small></div>

            <label className="check-label"><input type="checkbox" checked={draft.researchEnabled} onChange={e=>change('researchEnabled',e.target.checked)}/><span>{t('Investigate promising opportunities using my goals')}<small>{t('Checks up to two opportunities per run using your shared AI call budget. Unverified details stay unanswered.')}</small></span></label>
            <label className="check-label"><input type="checkbox" checked={draft.enabled} onChange={e=>change('enabled',e.target.checked)}/><span>{t('Enable scheduled searches')}</span></label>
            <button className="button secondary" disabled={busy}>{t('Save search settings')}</button>
          </form>
        </details>
        <ReviewedPreferences profile={data.profile} version={data.version} refresh={refresh}/>
      </>}
      {tab==='activity'&&<>
        <div className="integration-row"><Integration label={t("AI matching")} ready={data.integrations.ai}/><Integration label={t("Email delivery")} ready={data.integrations.email}/><Integration label={t("Worker")} ready={workerOnline} status={t(workerOnline?'Checked recently':'No recent check')}/></div>
        <div className="panel activity-summary"><Clock3 size={20}/><div><strong>{t("Last worker check:")} {date(data.state.heartbeat)}</strong><p>{data.profile.enabled?t('Next scheduled search: {date}',{date:date(data.state.nextRun)}):t("Scheduled searches are paused.")} {data.state.requested?t("A manual search is queued."):''}</p></div></div>
        <div className="section-heading"><h2>{t("Search history")}</h2><span className="source-label">{t("Last 30 runs")}</span></div>
        {!data.runs.length?<div className="empty-state"><Activity size={27}/><h2>{t("A fresh start.")}</h2><p>{t("Every search will leave a record here, including errors and partial results.")}</p></div>:<div className="run-list">{data.runs.map(run=><article className="run-card" key={run.id}><div className="run-top"><strong>{date(run.startedAt)}</strong><span className={`pill ${run.status==='completed'?'green':run.status==='failed'?'red':'neutral'}`}>{t(run.status)}</span></div><p>{run.discovered} {t("found")} <span>·</span> {run.evaluated} {t("evaluated")} <span>·</span> {run.matched} {t("strong matches")} <span>·</span> {(run.inputTokens+run.outputTokens).toLocaleString(locale==='es'?'es-ES':'en-GB')} {t("tokens")}</p>{run.discovery&&<SearchDiscoveryReport report={run.discovery}/>}{run.research&&<ResearchRunReport stats={run.research}/>} {run.error&&<div className="run-error"><AlertCircle size={15}/>{localizeMessage(run.error)}</div>}</article>)}</div>}
        <div className="section-heading"><h2>{t("Email deliveries")}</h2></div>{!data.deliveries.length?<p className="muted">{t("No notification emails have been queued yet.")}</p>:data.deliveries.map(delivery=><div className="run-card" key={delivery.id}><div className="run-top"><span><Mail size={15}/> {date(delivery.createdAt)}</span><span className={`pill ${delivery.status==='sent'?'green':'neutral'}`}>{t(delivery.status)}</span></div>{delivery.error&&<p className="error-text">{localizeMessage(delivery.error)}</p>}</div>)}
      </>}
    </main>
  </div>;
}
function Integration({label,ready,status}:{label:string;ready:boolean;status?:string}) {
 const {t,locale,date,number,message:localizeMessage}=useI18n();
 return <span className={`integration ${ready?'ready':''}`}><span className="tiny-dot"/>{label}<small>{status??(ready?t("Connected"):t("Needs setup"))}</small></span>; }
