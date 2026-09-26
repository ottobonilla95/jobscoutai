'use client';
import {useI18n,LanguageSelect} from './i18n';
import {useEffect,useState} from 'react';
export default function AccountSettings(){
 const {t,locale,date,number,message:localizeMessage}=useI18n();

 const [account,setAccount]=useState<{email:string;verified:boolean;emailAvailable:boolean}|null>(null);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{fetch('/api/account').then(r=>r.ok?r.json():null).then(setAccount).catch(()=>setMessage(t("Could not load account status.")));},[]);
 return <><section className="panel"><h2>{t('Language')}</h2><p>{t('Choose a language or follow your browser. Your choice is saved to your account.')}</p><LanguageSelect/><p className="footnote">{t('Automatic uses your last detected browser language for scheduled searches and emails. Existing source text and personal notes are unchanged.')}</p></section><section className="panel"><h2>{t("Your account")}</h2>{account&&<><p>{account.email} · {account.verified?t("Email verified"):t("Email not verified")}</p>{!account.verified&&<button type="button" className="button secondary" disabled={busy||!account.emailAvailable} onClick={async()=>{setBusy(true);try{const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify'})});const result=await response.json();setMessage(result.message||result.error);}catch{setMessage(t("Could not request verification."));}finally{setBusy(false);}}}>{t("Send verification email")}</button>}<p className="footnote">{t("Job emails can only go to your verified account address.")} {account.emailAvailable?'':t("Email delivery needs to be connected by the platform owner.")}</p></>}<a href="/account-help" className="text-button">{t("Reset password")}</a>{message&&<p role="status">{message}</p>}</section></>;
}
