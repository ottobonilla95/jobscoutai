'use client';
import {useState} from 'react';import type {Job} from '@core/profile';import {useI18n} from './i18n';
export default function ResearchAction({job,refresh}:{job:Job;refresh:()=>Promise<void>}){
 const {t,message:localize}=useI18n();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(job.status==='dismissed'||job.duplicateOf||job.verification?.status==='closed'||job.assessment?.eligibility==='ineligible')return null;
 return <div className="research-action"><button className="button secondary" disabled={busy||job.researchRequested} onClick={async()=>{setBusy(true);try{const response=await fetch(`/api/jobs/${encodeURIComponent(job.id)}/research`,{method:'POST'});const result=await response.json();if(!response.ok)throw new Error(result.error);setMessage(result.message);await refresh();}catch(e){setMessage(e instanceof Error?e.message:t('Could not request research.'));}finally{setBusy(false);}}}>{busy?t('Queuing research…'):job.researchRequested?t('Research queued'):t('Investigate what matters to me')}</button>{message&&<p role="status" className="footnote">{localize(message)}</p>}</div>;
}
