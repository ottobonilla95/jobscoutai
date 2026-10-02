'use client';
import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {translate,systemMessage} from '@core/i18n';
import {formatDate,formatNumber,type Locale,type LanguagePreference} from '@core/i18n/locale';
type Language={locale:Locale;preference:LanguagePreference};
const Context=createContext<Language&{change:(preference:LanguagePreference)=>Promise<void>}|null>(null);
export function I18nProvider({initial,children}:{initial:Language;children:React.ReactNode}){
 const [language,setLanguage]=useState(initial);
 useEffect(()=>{document.documentElement.lang=language.locale;document.title=translate(language.locale,'{productName} — Your next chapter');},[language.locale]);
 useEffect(()=>{if(initial.preference==='auto')fetch('/api/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sync:true})}).catch(()=>{});},[initial.preference]);
 const value=useMemo(()=>({...language,change:async(preference:LanguagePreference)=>{const response=await fetch('/api/language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preference})});if(!response.ok)throw new Error(translate(language.locale,'Could not save your language preference.'));setLanguage(await response.json());}}),[language]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n(){const context=useContext(Context);if(!context)throw new Error('Missing language provider.');return {...context,t:(key:string,params?:Record<string,string|number>)=>translate(context.locale,key,params),message:(text:string)=>systemMessage(context.locale,text),date:(value:string|null,withTime=true)=>formatDate(value,context.locale,withTime)||translate(context.locale,'Not yet'),number:(value:number)=>formatNumber(value,context.locale)};}
export function LanguageSelect(){const {t,locale,change}=useI18n();const [busy,setBusy]=useState(false);const [error,setError]=useState('');return <div className="language-control"><label>{t('Language')}<select value={locale} disabled={busy} onChange={async e=>{setBusy(true);setError('');try{await change(e.target.value as Locale);}catch(e){setError(e instanceof Error?e.message:t('Please try again.'));}finally{setBusy(false);}}}><option value="en">English</option><option value="es">Español</option></select></label>{error&&<p role="alert">{error}</p>}</div>;}
