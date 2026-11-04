'use client';

import {useState, type ChangeEvent} from 'react';
import {ArrowRight, FileText, LoaderCircle, Upload} from 'lucide-react';
import {useI18n} from './i18n';

export default function OnboardingCV({cvText,name,loading,busy,analyzing,error,notice,onUpload,onContinue,onRetry}:{
  cvText:string;name:string;loading:boolean;busy:boolean;analyzing:boolean;error:string;notice:string;
  onUpload:(event:ChangeEvent<HTMLInputElement>)=>Promise<void>;
  onContinue:(text:string,name:string)=>Promise<void>;onRetry:()=>void;
}){
  const {t,number,message:localizeMessage}=useI18n();
  const [text,setText]=useState(cvText);
  const valid=text.trim().length>=100;
  return <section className="onboarding-cv" aria-labelledby="cv-step-title" aria-busy={loading||(busy&&!analyzing)}>
    <div className="onboarding-cv-heading"><h1 id="cv-step-title">{t('Start with your CV')}</h1>
      <p>{t('We’ll read your CV before the chat so you can focus on what you want next.')}</p></div>
    {loading&&!error&&<p role="status" className="muted">{t('Loading your saved CV…')}</p>}
    <label className={`onboarding-cv-upload${busy||loading?' disabled':''}`}>
      {busy?<LoaderCircle size={22} className="spin"/>:<Upload size={22}/>}
      <span className="cv-upload-copy"><strong>{t(name?'Replace CV':'Upload your CV')}</strong><span>{t('PDF, DOCX or TXT · Up to 5 MB')}</span></span>
      <input type="file" className="setup-file" accept=".pdf,.docx,.txt" disabled={busy||loading} onChange={event=>void onUpload(event)}/>
    </label>
    {name&&<p className="onboarding-cv-filename"><FileText size={15}/>{name}</p>}
    <form onSubmit={event=>{event.preventDefault();if(valid&&!loading&&!busy)void onContinue(text,name);}}>
      <label htmlFor="onboarding-cv-text">{t(name?'Review your CV text':'Or paste your CV or experience')}</label>
      <p id="cv-text-help" className="muted">{t('Check the text below and correct anything missing before continuing. At least 100 characters are needed.')}</p>
      <textarea id="onboarding-cv-text" rows={10} maxLength={30000} value={text} disabled={busy||loading} onChange={event=>setText(event.target.value)} aria-describedby="cv-text-help" placeholder={t('Paste your CV or describe your experience…')}/>
      <p className="footnote cv-privacy">{t('Only the extracted text is saved. Your original file is not stored.')}</p>
      {notice&&<p role="status" className="chat-notice">{localizeMessage(notice)}</p>}
      {error&&<p role="alert" className="error-text">{localizeMessage(error)} {loading&&<button type="button" className="text-button" onClick={onRetry}>{t('Try again')}</button>}</p>}
      <div className="cv-continue"><span role="status" className={valid&&!analyzing?'cv-text-ready':'muted'}>{analyzing?t('Analyzing your CV…'):valid?t('Ready to continue'):t('{count} / 100 characters',{count:number(text.trim().length)})}</span><button type="submit" className="button primary" disabled={!valid||loading||busy}>{t('Continue to chat')}{busy?<LoaderCircle size={17} className="spin"/>:<ArrowRight size={17}/>}</button></div>
    </form>
  </section>;
}
