'use client';
import {useI18n} from './i18n';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import AuthShell from './auth-shell';
export default function Login({mode='login',signupOpen=true}:{mode?:'login'|'signup';signupOpen?:boolean}){
 const {t,message:localizeMessage}=useI18n();

 const signup=mode==='signup';
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [visible,setVisible]=useState(false);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 return <AuthShell>
  <h1>{signup?t("Find what comes next."):t("Welcome back.")}</h1>
  <p className="muted">{signup?t("Create your account, add your CV, and chat with your assistant to build a search around you."):t("Sign in to your opportunities and search profile.")}</p>
  <form aria-busy={busy} onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');
   try{const response=await fetch(`/api/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})});
    const data=await response.json().catch(()=>({error:t('Please try again.')}));if(!response.ok)throw new Error(data.error);window.location.assign(signup?'/onboarding':'/');
   }catch(error){setError(error instanceof Error?error.message:t("Please try again."));setBusy(false);}}}>
   <label htmlFor="email">{t("Email address")}</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder={t("you@example.com")}/>
   <label htmlFor="password">{t("Password")}</label><div className="password-field"><input id="password" name="password" type={visible?'text':'password'} autoComplete={signup?'new-password':'current-password'} required minLength={signup?12:undefined} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} aria-describedby={signup?'password-hint':undefined}/><button type="button" className="icon-button" aria-label={visible?t("Hide password"):t("Show password")} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
   {signup&&<small id="password-hint" className="muted">{t("At least 12 characters. A memorable phrase works well.")}</small>}
   {signup&&!signupOpen&&<p className="notice">{t("New registrations are currently closed.")}</p>}
   {error&&<p role="alert" className="error-text">{localizeMessage(error)}</p>}
   <button className="button primary full" disabled={busy||(signup&&!signupOpen)}>{busy?(signup?t("Creating your account…"):t("Signing in…")):(signup?t("Create account"):t("Sign in"))}<ArrowRight size={17}/></button>
  </form>
  {!signup&&<p className="auth-recovery"><Link href="/account-help">{t("Forgot your password?")}</Link></p>}
  <p className="auth-switch">{signup?t("Already have an account?"):t("New to {productName}?")} <Link href={signup?'/login':'/signup'}>{signup?t("Sign in"):t("Create an account")}</Link></p>
 </AuthShell>;
}
