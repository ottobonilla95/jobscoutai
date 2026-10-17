'use client';

import {useState, type ChangeEvent} from 'react';
import {ArrowRight, FileText, LoaderCircle, Upload} from 'lucide-react';
import {useI18n} from './i18n';

export function OnboardingSteps({step}:{step:1|2}){
  const {t}=useI18n();
  return <ol className="onboarding-steps" aria-label={t('Search setup')}>
    <li aria-current={step===1?'step':undefined}><span>1</span>{t('Your CV')}</li>
    <li aria-current={step===2?'step':undefined}><span>2</span>{t('Your search')}</li>
  </ol>;
}

export default function OnboardingCV({cvText,name,loading,busy,error,notice,onUpload,onContinue,onRetry}:{
  cvText:string;name:string;loading:boolean;busy:boolean;error:string;notice:string;
  onUpload:(event:ChangeEvent<HTMLInputElement>)=>Promise<void>;
  onContinue:(text:string,name:string)=>Promise<void>;onRetry:()=>void;
}){
  const {t,message:localizeMessage}=useI18n();
  const [text,setText]=useState(cvText);
  const valid=text.trim().length>=100;
  return <section className="onboarding-cv" aria-labelledby="cv-step-title" aria-busy={busy||loading}>
    <OnboardingSteps step={1}/>
    <div className="onboarding-cv-heading"><span className="chat-avatar"><FileText size={22}/></span><h1 id="cv-step-title">{t('Start with your CV')}</h1>
      <p>{t('Add your experience first. Then we’ll chat about what you want next.')}</p></div>
    {loading&&!error&&<p role="status" className="muted">{t('Loading your saved CV…')}</p>}
    <label className={`onboarding-cv-upload${busy||loading?' disabled':''}`}>
      {busy?<LoaderCircle size={22} className="spin"/>:<Upload size={22}/>}
      <strong>{t(name?'Replace CV':'Upload your CV')}</strong>
      <span>{t('PDF, DOCX or TXT · Up to 5 MB')}</span>
      <input type="file" className="setup-file" accept=".pdf,.docx,.txt" disabled={busy||loading} onChange={event=>void onUpload(event)}/>
    </label>
    {name&&<p className="onboarding-cv-filename"><FileText size={15}/>{name}</p>}
    <form onSubmit={event=>{event.preventDefault();if(valid&&!loading&&!busy)void onContinue(text,name);}}>
      <label htmlFor="onboarding-cv-text">{t(name?'Review your CV text':'Or paste your CV or experience')}</label>
      <p id="cv-text-help" className="muted">{t('Check the text below and correct anything missing before continuing. At least 100 characters are needed.')}</p>
      <textarea id="onboarding-cv-text" rows={10} maxLength={30000} value={text} disabled={busy||loading} onChange={event=>setText(event.target.value)} aria-describedby="cv-text-help" placeholder={t('Paste your CV or describe your experience…')}/>
      <p className="footnote">{t('Only the extracted text is saved. Your original file is not stored.')}</p>
      {notice&&<p role="status" className="chat-notice">{localizeMessage(notice)}</p>}
      {error&&<p role="alert" className="error-text">{localizeMessage(error)} {loading&&<button type="button" className="text-button" onClick={onRetry}>{t('Try again')}</button>}</p>}
      <button type="submit" className="button primary" disabled={!valid||loading||busy}>{busy?<LoaderCircle size={17} className="spin"/>:<ArrowRight size={17}/>} {t('Continue to chat')}</button>
    </form>
  </section>;
}
