'use client';
import {useState} from 'react';import type {Profile} from '@core/profile';import {useI18n} from './i18n';
export default function ReviewedPreferences({profile,version,refresh}:{profile:Profile;version:number;refresh:()=>Promise<void>}){
 const {t,message:localize}=useI18n();const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 return <section className="panel"><h2>{t('Preferences learned from your feedback')}</h2><p>{t('Only preferences you explicitly applied guide future searches. Remove any that no longer fit.')}</p>
  {!profile.reviewedPreferences.length?<p className="muted">{t('No feedback preferences applied yet.')}</p>:<ul>{profile.reviewedPreferences.map(p=><li key={p.id}><p>{p.text}</p><button className="text-button" disabled={busy} onClick={async()=>{setBusy(true);try{const response=await fetch('/api/preferences',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id,version})});const result=await response.json();if(!response.ok)throw new Error(result.error);await refresh();}catch(e){setMessage(e instanceof Error?e.message:t('Could not update preference.'));}finally{setBusy(false);}}}>{t('Remove preference')}</button></li>)}</ul>}{message&&<p role="alert">{localize(message)}</p>}
 </section>;
}
