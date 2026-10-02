'use client';
import {useI18n,LanguageSelect} from './i18n';
import {useEffect,useState} from 'react';
export default function AccountSettings(){
 const {t}=useI18n();

 const [account,setAccount]=useState<{email:string;verified:boolean;emailAvailable:boolean}|null>(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{fetch('/api/account').then(r=>r.ok?r.json():null).then(setAccount).catch(()=>setMessage(t("Could not load account status.")));},[]);
 return <><section className="panel"><h2>{t('Language')}</h2><p>{t('Choose your language. Your choice is saved to your account.')}</p><LanguageSelect/></section><section className="panel"><h2>{t("Your account")}</h2>{account&&<><p>{account.email} · {account.verified?t("Email verified"):t("Email not verified")}</p>{!account.verified&&<button type="button" className="button secondary" disabled={busy||!account.emailAvailable} onClick={async()=>{setBusy(true);try{const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify'})});const result=await response.json();setMessage(result.message||result.error);}catch{setMessage(t("Could not request verification."));}finally{setBusy(false);}}}>{t("Send verification email")}</button>}<p className="footnote">{t("Job emails can only go to your verified account address.")} {account.emailAvailable?'':t("Email delivery needs to be connected by the platform owner.")}</p></>}<a href="/account-help" className="text-button">{t("Reset password")}</a>{message&&<p role="status">{message}</p>}</section>{account&&<DeleteAccount/>}</>;
}

function DeleteAccount(){
 const {t}=useI18n();
 const [expanded,setExpanded]=useState(false);
 const [password,setPassword]=useState('');
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 return <section className="panel" aria-labelledby="delete-account-heading">
  <h2 id="delete-account-heading">{t('Delete account')}</h2>
  <p>{t('Permanently delete your account and all saved data, including your CV, profile, jobs, notes, search history, and queued emails. This cannot be undone.')}</p>
  {expanded?<form onSubmit={async event=>{
   event.preventDefault();if(busy||!confirmed)return;
   setBusy(true);setError('');
   try{
    const response=await fetch('/api/account',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,confirmation:'DELETE'})});
    const result=await response.json();
    if(!response.ok){setError(result.error||t('Could not delete your account. Please try again.'));return;}
    window.location.replace('/login');
   }catch{setError(t('Could not delete your account. Please try again.'));}
   finally{setBusy(false);}
  }}>
   <label>{t('Current password')}<input type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)}/></label>
   <label className="check-label"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>{t('I understand that my account and saved data will be permanently deleted.')}</label>
   {error&&<p role="alert" className="error-text">{error}</p>}
   <div className="integration-row">
    <button type="submit" className="button red" disabled={busy||!confirmed||!password}>{busy?t('Deleting account…'):t('Permanently delete my account')}</button>
    <button type="button" className="button secondary" disabled={busy} onClick={()=>{setExpanded(false);setPassword('');setConfirmed(false);setError('');}}>{t('Cancel')}</button>
   </div>
  </form>:<button type="button" className="button red" onClick={()=>setExpanded(true)}>{t('Delete account')}</button>}
 </section>;
}
