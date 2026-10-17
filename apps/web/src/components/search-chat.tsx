'use client';

import {useCallback, useEffect, useRef, useState, type ChangeEvent} from 'react';
import {ArrowRight, Check, FileText, LoaderCircle, MessageCircle, Paperclip, Send} from 'lucide-react';
import type {SearchChat as Conversation} from '@core/search-chat-schema';
import {locationLabel} from '@core/locations';
import {sourceLabel} from '@core/source-settings';
import {useI18n} from './i18n';

export default function SearchChat({onboarding=false,onSaved,profileKey=''}:{onboarding?:boolean;onSaved?:()=>Promise<void>;profileKey?:string}){
  const {t,locale,message:localizeMessage}=useI18n();
  const [chat,setChat]=useState<Conversation|null>(null);
  const [text,setText]=useState('');const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [verificationNeeded,setVerificationNeeded]=useState(false);
  const [setupSaved,setSetupSaved]=useState(false);
  const [pendingText,setPendingText]=useState('');
  const [verifying,setVerifying]=useState(false);
  const sending=useRef(false);const transcript=useRef<HTMLDivElement>(null);
  const composer=useRef<HTMLTextAreaElement>(null);
  const load=useCallback(async()=>{
    const response=await fetch('/api/chat');
    if(response.status===401){window.location.assign('/login');return;}
    const result=await response.json();if(!response.ok)throw new Error(result.error||t('Could not load your conversation.'));
    setChat(result.chat);
    setVerificationNeeded(Boolean(result.verificationNeeded));
  },[locale]);
  useEffect(()=>{void load().catch(e=>setError(e.message));},[load,profileKey]);
  useEffect(()=>{const node=transcript.current;if(node)node.scrollTop=node.scrollHeight;},[chat?.revision,busy,pendingText]);

  async function request(body:Record<string,unknown>){
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok){if(response.status===409)await load();throw new Error(result.error);}
    setChat(result.chat);return result;
  }
  async function send(){
    if(!chat||sending.current||!text.trim())return;
    const submitted=text.trim();setPendingText(submitted);setText('');
    sending.current=true;setBusy(true);setError('');setNotice('');
    try{await request({action:'message',revision:chat.revision,text:submitted});}
    catch(e){setText(submitted);setError(e instanceof Error?e.message:t('Please try again.'));}
    finally{sending.current=false;setPendingText('');setBusy(false);composer.current?.focus();}
  }
  async function upload(event:ChangeEvent<HTMLInputElement>){
    const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file||!chat||sending.current)return;
    sending.current=true;setBusy(true);setError('');setNotice('');
    try{
      const form=new FormData();form.append('cv',file);
      const response=await fetch('/api/cv',{method:'POST',body:form});const result=await response.json();
      if(!response.ok)throw new Error(result.error);
      await request({action:'upload',revision:chat.revision,text:result.text,name:result.name});
      if(result.truncated)setNotice(t('Your CV was shortened to 30,000 characters. You can review the extracted text below.'));
    }catch(e){setError(e instanceof Error?e.message:t('Could not read CV.'));}
    finally{sending.current=false;setBusy(false);}
  }
  async function save(startSearch:boolean){
    if(!chat||sending.current)return;
    sending.current=true;setBusy(true);setError('');setNotice('');
    let committed=false;let succeeded=false;
    try{
      const result=await request({action:'commit',revision:chat.revision});committed=true;
      setSetupSaved(true);
      setVerificationNeeded(result.verificationNeeded);
      setNotice(t('Your search preferences are saved.'));
      if(startSearch){
        const response=await fetch('/api/search',{method:'POST'});const search=await response.json();
        if(!response.ok)throw new Error(`${t('Your preferences are saved.')} ${localizeMessage(search.error)}`);
        setNotice(localizeMessage(search.message));
      }
      succeeded=true;
    }catch(e){setError(e instanceof Error?e.message:t('Could not save.'));}
    finally{
      sending.current=false;setBusy(false);
      if(committed){
        if(onboarding&&succeeded)window.location.assign('/');
        else try{await onSaved?.();}catch{setError(t('Preferences saved. Refresh the page to update your results.'));}
      }
    }
  }
  const answers=chat?.draft.answers;
  return <section className={`search-chat${onboarding?' search-chat-onboarding':''}`} aria-label={t('Your search assistant')}>
    <header className="chat-header"><div className="chat-heading"><span className="chat-avatar"><MessageCircle size={19}/></span><div><h2>{t('Your search assistant')}</h2><p>{t(onboarding?'A conversation to find your next chapter.':'Keep shaping your search.')}</p></div></div><span className="chat-saved"><span className="tiny-dot"/>{t(busy?'Working…':chat?.ready?'Draft saved · Preferences not applied':'Conversation saved')}</span></header>
    <div className="chat-transcript" ref={transcript} role="log" aria-live="polite" aria-relevant="additions" aria-label={t('Search conversation')} aria-busy={busy} tabIndex={0}>
      {!chat&&!error&&<p className="muted">{t('Loading your conversation…')}</p>}
      {chat?.messages.map(message=><article key={message.id} className={`chat-message chat-message-${message.role}`}><span className="chat-speaker">{t(message.role==='user'?'You':'Search assistant')}</span>{chat.ready&&message.id===chat.messages.at(-1)?.id&&<span className="chat-proposal">{t('Proposed changes · Save below to apply')}</span>}<p>{message.text}</p></article>)}
      {pendingText&&<article className="chat-message chat-message-user"><span className="chat-speaker">{t('You')}</span><p>{pendingText}</p></article>}
      {busy&&<div role="status" className="chat-working"><LoaderCircle size={16} className="spin"/>{t('Thinking about your search…')}</div>}
      {chat?.ready&&answers&&<div className="chat-review">
        <span className="eyebrow">{t('READY WHEN YOU ARE')}</span><h3>{t('Your search, ready to save.')}</h3>
        <p>{chat.draft.matching?.summary}</p>
        <dl>
          {answers.name&&<><dt>{t('Name')}</dt><dd>{answers.name}</dd></>}
          <dt>{t('Target roles')}</dt><dd>{answers.titles.split('\n').join(' · ')}</dd>
          <dt>{t('Locations')}</dt><dd>{answers.selectedLocations.map(place=>locationLabel(place,locale)).join(' · ')}</dd>
          <dt>{t('Work preference')}</dt><dd>{t(answers.remotePreference==='remote'?'Remote only':'Also open to office work')}</dd>
          <dt>{t('Search frequency')}</dt><dd>{t('Every {count} hours',{count:answers.intervalHours})} · {t(chat.settings.enabled?'Automatic searches enabled':'Automatic searches paused')}</dd>
          <dt>{t('Email alerts')}</dt><dd>{t(answers.emailAlerts?'On after email verification':'Off')}</dd>
        </dl>
        <details><summary>{t('Review all preferences')}</summary><dl>
          <dt>{t('Your goal')}</dt><dd>{answers.objective}</dd>
          <dt>{t('Work authorization')}</dt><dd>{answers.workAuthorization||t('Not specified')}</dd>
          <dt>{t('Salary')}</dt><dd>{answers.salaryExpectation||t('Not specified')}</dd>
          <dt>{t('Equity')}</dt><dd>{answers.equityExpectation||t('Not specified')}</dd>
          <dt>{t('Must-haves and dealbreakers')}</dt><dd>{answers.constraints||t('Not specified')}</dd>
          {answers.goalClarifications.filter(q=>q.answer).map(q=><div key={q.id}><dt>{q.question}</dt><dd>{q.answer}</dd></div>)}
          <dt>{t('Search sources')}</dt><dd>{chat.settings.sources.map(sourceLabel).join(' · ')}{chat.settings.companyBoards.map(url=><div key={url}>{url}</div>)}</dd>
          <dt>{t('Opportunity research')}</dt><dd>{t(chat.settings.researchEnabled?'On':'Off')}</dd>
          <dt>{t('Minimum fit score')}</dt><dd>{chat.settings.minimumScore}/100</dd>
          <dt>{t('Listing age limit')}</dt><dd>{t('{count} days',{count:chat.settings.postedWithinDays})} · {t(chat.settings.includeUnknownDates?'Include unknown dates':'Exclude unknown dates')}</dd>
          <dt>{t('Evaluations per search')}</dt><dd>{chat.settings.maxJobsPerRun}</dd>
          <dt>{t('Daily AI call limit')}</dt><dd>{chat.settings.dailyEvaluationLimit}</dd>
        </dl></details>
        <p className="footnote">{t('Save these preferences or keep chatting to refine them.')}</p>
        <div className="chat-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>void save(true)}>{t(onboarding?'Save and start searching':'Save and search')}<ArrowRight size={16}/></button><button type="button" className="text-button" disabled={busy} onClick={()=>void save(false)}>{t('Save preferences')}</button></div>
      </div>}
    </div>
    {answers?.cvText&&<details className="chat-cv"><summary><FileText size={14}/>{answers.cvFileName||t('Experience added')} · {t('Review text')}</summary><pre>{answers.cvText}</pre></details>}
    <div className="chat-feedback">
      {notice&&<p role="status" className="chat-notice"><Check size={14}/>{notice}</p>}
      {onboarding&&setupSaved&&<a href="/" className="text-button">{t('Go to my opportunities')}<ArrowRight size={14}/></a>}
      {verificationNeeded&&<p className="footnote">{t('Email alerts will start after you verify your account email. Your preference is saved.')} <button type="button" className="text-button" disabled={verifying} onClick={async()=>{
        setVerifying(true);setError('');try{const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify'})});const result=await response.json();if(!response.ok)throw new Error(result.error);setNotice(localizeMessage(result.message));}catch(e){setError(e instanceof Error?e.message:t('Could not request verification.'));}finally{setVerifying(false);}
      }}>{t('Send verification email')}</button></p>}
      {error&&<p role="alert" className="error-text">{localizeMessage(error)} {!chat&&<button type="button" className="text-button" onClick={()=>{setError('');void load().catch(e=>setError(e.message));}}>{t('Try again')}</button>}</p>}
    </div>
    <form className="chat-composer" onSubmit={event=>{event.preventDefault();void send();}}>
      <label className="sr-only" htmlFor={onboarding?'setup-chat-message':'search-chat-message'}>{t('Message your search assistant')}</label>
      <textarea ref={composer} id={onboarding?'setup-chat-message':'search-chat-message'} rows={3} maxLength={32000} value={text} disabled={!chat||busy} onChange={event=>setText(event.target.value)} placeholder={t(onboarding?'Tell me about you and what you want next…':'What would you like to change about your search?')} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}}/>
      <div className="chat-composer-actions"><label className={`chat-attach${busy||!chat?' disabled':''}`}><Paperclip size={16}/>{t('Add CV')}<input type="file" className="setup-file" accept=".pdf,.docx,.txt" disabled={busy||!chat} onChange={event=>void upload(event)}/></label><button type="submit" className="button primary" disabled={!text.trim()||!chat||busy} aria-label={t('Send message')}><Send size={16}/></button></div>
      <small>{t('PDF, DOCX or TXT · You can also paste experience here. Shift + Enter for a new line.')}</small>
    </form>
  </section>;
}
