'use client';
import {brand} from '@core/brand';
import {useI18n,LanguageSelect} from './i18n';
import Link from 'next/link';
import { useState } from 'react';
import { Compass, ArrowRight, LockKeyhole, Eye, EyeOff } from 'lucide-react';
export default function Login({mode='login',signupOpen=true}:{mode?:'login'|'signup';signupOpen?:boolean}){
 const {t,locale,date,number,message:localizeMessage}=useI18n();

 const signup=mode==='signup';
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [visible,setVisible]=useState(false);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 return <main className="login-wrap"><div className="login-card">
  <Link href="/login" className="brand"><span className="brand-icon"><Compass size={23}/></span><span>{brand.name}</span></Link>
  <LanguageSelect/>
  <span className="eyebrow">{t("YOUR SEARCH. YOUR NEXT CHAPTER.")}</span>
  <h1>{signup?t("Find what comes next."):t("Welcome back.")}</h1>
  <p className="muted">{signup?t("Create your account, add your CV, and build a search around what matters to you."):t("Sign in to your opportunities and search profile.")}</p>
  <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');
   try{const response=await fetch(`/api/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})});
    const data=await response.json();if(!response.ok)throw new Error(data.error);window.location.assign(signup?'/?welcome=1':'/');
   }catch(error){setError(error instanceof Error?error.message:t("Please try again."));setBusy(false);}}}>
   <label htmlFor="email">{t("Email address")}</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder={t("you@example.com")}/>
   <label htmlFor="password">{t("Password")}</label><div className="password-field"><input id="password" name="password" type={visible?'text':'password'} autoComplete={signup?'new-password':'current-password'} required minLength={signup?12:undefined} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} aria-describedby={signup?'password-hint':undefined}/><button type="button" className="icon-button" aria-label={visible?t("Hide password"):t("Show password")} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
   {signup&&<small id="password-hint" className="muted">{t("At least 12 characters. A memorable phrase works well.")}</small>}
   {signup&&!signupOpen&&<p className="notice">{t("New registrations are currently closed.")}</p>}
   {error&&<p role="alert" className="error-text">{error}</p>}
   <button className="button primary full" disabled={busy||(signup&&!signupOpen)}>{busy?(signup?t("Creating your account…"):t("Signing in…")):(signup?t("Create account"):t("Sign in"))}<ArrowRight size={17}/></button>
  </form>
  {!signup&&<p className="auth-switch"><Link href="/account-help">{t("Forgot your password?")}</Link></p>}
  <p className="auth-switch">{signup?t("Already have an account?"):t("New to {productName}?")} <Link href={signup?'/login':'/signup'}>{signup?t("Sign in"):t("Create an account")}</Link></p>
  <div className="login-note"><LockKeyhole size={14}/> {t("Your CV and job list stay in your account.")}</div>
 </div></main>;
}
