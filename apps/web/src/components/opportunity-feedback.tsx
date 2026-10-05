'use client';
import {useState} from 'react';import type {Job} from '@core/profile';import {useI18n} from './i18n';
export default function OpportunityFeedback({job,refresh}:{job:Job;refresh:()=>Promise<void>}){
 const {t,message:localize}=useI18n();const feedback=job.feedback;
 const [reason,setReason]=useState(feedback?.reason||''),[preference,setPreference]=useState(feedback?.proposedPreference||''),[archive,setArchive]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function send(method:string,body:unknown){setBusy(true);setMessage('');try{const response=await fetch(`/api/jobs/${encodeURIComponent(job.id)}/feedback`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error);await refresh();}catch(e){setMessage(e instanceof Error?e.message:t('Could not save feedback.'));}finally{setBusy(false);}}
 return <details className="job-details feedback-editor" open={feedback?.status==='proposed'}><summary>{t('Teach the search what fits you')}</summary>
  <form onSubmit={e=>{e.preventDefault();void send('POST',{reason,archive});}}>
   <label>{t('What worked or missed the mark?')}<textarea required minLength={5} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder={t('For example: I prefer hands-on work over managing a large team.')}/></label>
   <label className="check-label"><input type="checkbox" checked={archive} onChange={e=>setArchive(e.target.checked)}/><span>{t('Also archive this opportunity')}</span></label>
   <button className="button secondary" disabled={busy}>{t('Save feedback')}</button>
  </form>
  {feedback?.status==='proposed'&&<div className="feedback-review"><h3>{t('Should this guide future opportunities, or only this one?')}</h3><p className="footnote">{t('Review the preference below before applying it. It changes relative fit; your confirmed requirements stay in place.')}</p>
   <label>{t('Preference for future searches')}<textarea minLength={5} maxLength={500} value={preference} onChange={e=>setPreference(e.target.value)}/></label>
   <div className="filter-row"><button className="button primary" disabled={busy||preference.trim().length<5} onClick={()=>void send('PATCH',{id:feedback.id,action:'apply',preference})}>{t('Apply to future searches')}</button><button className="button secondary" disabled={busy} onClick={()=>void send('PATCH',{id:feedback.id,action:'job_only'})}>{t('Keep only for this opportunity')}</button></div>
  </div>}
  {feedback&&feedback.status!=='proposed'&&<p className="footnote">{t(feedback.status==='applied'?'Preference applied. Manage it in your search profile.':'Feedback saved for this opportunity only.')}</p>}
  {message&&<p role="alert">{localize(message)}</p>}
 </details>;
}
