'use client';
import {useI18n} from './i18n';
import AuthShell from './auth-shell';
import Link from 'next/link';
import {useEffect,useState} from 'react';
export default function AccountHelp(){
 const {t,message:localizeMessage}=useI18n();

 const [link,setLink]=useState<{purpose:'reset'|'verify';token:string}|null>(null);const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
 useEffect(()=>{const params=new URLSearchParams(window.location.hash.slice(1));const purpose=params.has('verify')?'verify':'reset';const token=params.get(purpose);if(token){setLink({purpose,token});window.history.replaceState(null,'','/account-help');}},[]);
 return <AuthShell><h1>{link?.purpose==='verify'?t("Verify your email"):link?t("Choose a new password"):t("Reset your password")}</h1><p className="muted">{t(link?.purpose==='verify'?'Confirm your email to enable account email features.':link?'Use a memorable phrase with at least 12 characters.':'Enter your account email to request a password reset link.')}</p><form aria-busy={busy} onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(link?{action:'consume',...link,password:link.purpose==='reset'?password:undefined}:{action:'reset',email})});const result=await response.json().catch(()=>({error:t('Please try again.')}));if(!response.ok)throw new Error(result.error);setMessage(link?(link.purpose==='verify'?t("Email verified. You can return to your account."):t("Password updated. Sign in with your new password.")):result.message);if(link)setDone(true);}catch(e){setMessage(e instanceof Error?e.message:t("Please try again."));}finally{setBusy(false);}}}>
 {!link&&<label>{t("Email address")}<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}
 {link?.purpose==='reset'&&!done&&<label>{t("New password")}<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
 {!done&&<button className="button primary full" disabled={busy}>{busy?t("Working…"):link?(link.purpose==='verify'?t("Verify email"):t("Update password")):t("Send reset link")}</button>}
 {message&&<p role="status" className="auth-feedback">{localizeMessage(message)}</p>}</form><p className="auth-switch"><Link href="/login">{t("Back to sign in")}</Link></p></AuthShell>;
}
