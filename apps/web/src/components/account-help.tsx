'use client';
import {brand} from '@core/brand';
import {useI18n,LanguageSelect} from './i18n';
import Link from 'next/link';
import {useEffect,useState} from 'react';
export default function AccountHelp(){
 const {t,locale,date,number,message:localizeMessage}=useI18n();

 const [link,setLink]=useState<{purpose:'reset'|'verify';token:string}|null>(null);const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
 useEffect(()=>{const params=new URLSearchParams(window.location.hash.slice(1));const purpose=params.has('verify')?'verify':'reset';const token=params.get(purpose);if(token){setLink({purpose,token});window.history.replaceState(null,'','/account-help');}},[]);
 return <main className="login-wrap"><div className="login-card"><Link className="brand" href="/login">{brand.name}</Link><LanguageSelect/><h1>{link?.purpose==='verify'?t("Verify your email"):link?t("Choose a new password"):t("Reset your password")}</h1><form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(link?{action:'consume',...link,password:link.purpose==='reset'?password:undefined}:{action:'reset',email})});const result=await response.json();if(!response.ok)throw new Error(result.error);setMessage(link?(link.purpose==='verify'?t("Email verified. You can return to your account."):t("Password updated. Sign in with your new password.")):result.message);if(link)setDone(true);}catch(e){setMessage(e instanceof Error?e.message:t("Please try again."));}finally{setBusy(false);}}}>
 {!link&&<label>{t("Email address")}<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}
 {link?.purpose==='reset'&&!done&&<label>{t("New password")}<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
 {!done&&<button className="button primary full" disabled={busy}>{busy?t("Working…"):link?(link.purpose==='verify'?t("Verify email"):t("Update password")):t("Send reset link")}</button>}
 {message&&<p role="status">{message}</p>}</form><p className="auth-switch"><Link href="/login">{t("Back to sign in")}</Link></p></div></main>;
}
