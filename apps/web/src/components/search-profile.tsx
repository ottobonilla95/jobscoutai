'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, Upload } from 'lucide-react';
import type { Profile } from '@core/profile';
import { draftFromProfile, standardMatching } from '@core/search-setup';
import { firstIncompleteStep, matchingBasis, setupStepError, type SetupAnswers, type SetupDraft } from '@core/setup-schema';
import { useI18n } from './i18n';

const questions=[
  'What should we call you?', 'Bring your experience along', 'What kind of opportunity do you want?',
  'Which roles interest you?', 'Where would you like to work?', 'How would you like to work?',
  'Any work authorization or sponsorship requirements?', 'What are your salary expectations?',
  'What are your equity expectations?', 'Any must-haves or dealbreakers?', 'How often should we search?',
  'Would you like email alerts?', 'Your search, ready to go.',
];
const optional=new Set([0,6,7,8,9,11]);
const optionalKeys:Record<number,keyof SetupAnswers>={0:'name',6:'workAuthorization',7:'salaryExpectation',8:'equityExpectation',9:'constraints'};
export default function SearchProfile({profile,minimum,onboarding=false,onSaved}:{profile:Profile;minimum:number;onboarding?:boolean;onSaved?:()=>Promise<void>}) {
  const {t,locale}=useI18n();
  const [draft,setDraft]=useState<SetupDraft>(()=>{const value=draftFromProfile(profile,minimum);return onboarding?value:{...value,step:12};});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [saveState,setSaveState]=useState('Progress saved');
  const [reviewing,setReviewing]=useState(!onboarding||draft.step===12);
  const [verificationNeeded,setVerificationNeeded]=useState(false);
  const [completed,setCompleted]=useState(false);
  const heading=useRef<HTMLHeadingElement>(null);
  const current=useRef(draft);current.current=draft;
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const queue=useRef<Promise<unknown>>(Promise.resolve());
  const finished=useRef(false);
  const saved=useRef(JSON.stringify(draft));
  const a=draft.answers;
  const matchingCurrent=Boolean(draft.matching&&draft.matching.basis===matchingBasis(a));
  const step=draft.step;

  function update<K extends keyof SetupAnswers>(key:K,value:SetupAnswers[K]) {
    setDraft(d=>({...d,answers:{...d.answers,[key]:value}}));setError('');setNotice('');
  }
  async function persist(value:SetupDraft) {
    if(timer.current)clearTimeout(timer.current);
    const body=JSON.stringify(value);
    setSaveState('Saving progress…');
    const pending=queue.current.catch(()=>{}).then(async()=>{
      const response=await fetch('/api/setup',{method:'PUT',headers:{'Content-Type':'application/json'},body});
      if(!response.ok)throw new Error(t('Could not save your progress. Please try again.'));
      saved.current=body;
      if(JSON.stringify(current.current)===body)setSaveState('Progress saved');
    });
    queue.current=pending;
    try{await pending;}catch(e){setSaveState('Progress not saved');throw e;}
  }
  useEffect(()=>{
    if(finished.current||JSON.stringify(draft)===saved.current)return;
    setSaveState('Saving progress…');
    timer.current=setTimeout(()=>{void persist(draft).catch(e=>setError(e.message));},650);
    return ()=>{if(timer.current)clearTimeout(timer.current);};
  },[draft]);
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(!finished.current&&JSON.stringify(current.current)!==saved.current)event.preventDefault();};
    window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);
  },[]);
  useEffect(()=>{heading.current?.focus();},[step]);

  async function suggest(kind:'roles'|'matching',answers=a) {
    setBusy(true);setError('');setNotice('');
    try {
      const response=await fetch('/api/profile-suggestions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers,kind})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      if(kind==='roles'){
        setDraft(d=>({...d,answers:{...d.answers,titles:result.titles.join('\n')}}));
        setNotice(t('Suggested from your CV and goal. Edit these roles, then confirm with Next.'));
      }else setDraft(d=>({...d,matching:result.matching}));
    }catch(e){setError(e instanceof Error?e.message:t('Could not generate suggestions. Your answers are safe; retry or use standard matching.'));}
    finally{setBusy(false);}
  }
  async function move(next:number,skip=false) {
    setError('');setNotice('');
    let value=draft;
    if(skip){const key=optionalKeys[step];value={...draft,answers:{...a,...(key?{[key]:''}:{emailAlerts:false})}};}
    if(next>step&&!skip){const problem=setupStepError(step,a,minimum);if(problem){setError(t(problem));return;}}
    const updated={...value,step:next};
    setBusy(true);
    try{await persist(updated);setDraft(updated);setSaveState('Progress saved');if(next===12)setReviewing(true);}
    catch(e){setError(e instanceof Error?e.message:t('Could not save your progress. Please try again.'));return;}
    finally{setBusy(false);}
    if(next===3&&!value.answers.titles.trim())await suggest('roles',value.answers);
    if(next===12&&onboarding&&!reviewing&&firstIncompleteStep(value.answers,minimum)===null&&!value.matching)await suggest('matching',value.answers);
  }
  async function finish() {
    const missing=firstIncompleteStep(a,minimum);
    if(missing!==null){setError(t(setupStepError(missing,a,minimum)!));setDraft(d=>({...d,step:missing}));return;}
    if(!matchingCurrent){setError(t('Update your matching preferences or choose standard matching.'));return;}
    setBusy(true);setError('');
    try {
      await persist(draft);
      finished.current=true;
      const response=await fetch('/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setVerificationNeeded(result.verificationNeeded);
      if(onboarding)setCompleted(true);
      else {setNotice(t('Your search profile is saved.'));await onSaved?.();finished.current=false;saved.current=JSON.stringify(draft);}
    }catch(e){finished.current=false;setError(e instanceof Error?e.message:t('Could not save.'));}
    finally{setBusy(false);}
  }
  async function verify() {
    setBusy(true);setError('');
    try{const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify'})});const result=await response.json();if(!response.ok)throw new Error(result.error);setNotice(result.message);}
    catch(e){setError(e instanceof Error?e.message:t('Could not request verification.'));}finally{setBusy(false);}
  }
  const alerts=<div className="setup-alerts"><p>{t('Email alerts will start after you verify your account email. Your preference is saved.')}</p><button type="button" className="text-button" disabled={busy} onClick={verify}>{t('Send verification email')}</button></div>;
  if(completed)return <section className="setup-card setup-complete"><Check size={32}/><h1>{t('Your profile is ready.')}</h1><p>{t('Your search is set up. You can change any answer in Search profile.')}</p>{verificationNeeded&&alerts}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error-text">{error}</p>}<a className="button primary" href="/">{t('Go to my opportunities')}<ArrowRight size={18}/></a></section>;
  const frequencies=[...new Set([minimum,4,8,12,24,48,168,a.intervalHours].filter(n=>n>=minimum))].sort((x,y)=>x-y);
  const values=[a.name,a.cvFileName||(a.cvText?t('Experience added'):''),a.objective,a.titles,a.locationChoice==='anywhere'?t('Anywhere'):a.locations,a.remotePreference==='remote'?t('Remote only'):a.remotePreference==='flexible'?t('Also open to office work'):'',a.workAuthorization,a.salaryExpectation,a.equityExpectation,a.constraints,t('Every {count} hours',{count:a.intervalHours}),a.emailAlerts?t('Yes, email me strong matches'):t('No email alerts')];
  const field=(key:'name'|'objective'|'titles'|'locations'|'workAuthorization'|'salaryExpectation'|'equityExpectation'|'constraints',rows=1,maxLength=3000,placeholder?:string)=><label className="setup-field"><span className="sr-only">{t(questions[step])}</span>{rows>1?<textarea aria-describedby="question-hint" rows={rows} maxLength={maxLength} value={a[key]} placeholder={placeholder} onChange={e=>update(key,e.target.value)}/>:<input aria-describedby="question-hint" maxLength={maxLength} value={a[key]} placeholder={placeholder} onChange={e=>update(key,e.target.value)}/>}</label>;
  return <section className={`setup-card ${step===12?'setup-review':''}`}>
    {onboarding&&<div className="setup-progress"><div><span>{t('YOUR SEARCH STARTS HERE')}</span><span>{t('Step {current} of {total}',{current:step+1,total:13})}</span></div><progress max={13} value={step+1} aria-label={t('Profile setup progress')}/></div>}
    <div className="setup-kicker"><span>{optional.has(step)?t('Optional'):step===12?t('Review and finish'):t('Required')}</span><span role="status">{t(saveState)}</span></div>
    <h1 ref={heading} tabIndex={-1}>{t(questions[step])}</h1>
    <form onSubmit={e=>{e.preventDefault();if(step===12)void finish();else void move(reviewing?12:step+1);}}>
      <fieldset disabled={busy} className="setup-fields">
      {step===0&&<><p id="question-hint">{t('A name makes this feel a little more like you.')}</p>{field('name',1,100)}</>}
      {step===1&&<><p id="question-hint">{t('Upload your CV or paste your experience. We will suggest roles for you to confirm.')}</p><div className="setup-upload"><FileText size={28}/><strong>{a.cvFileName||t('PDF, DOCX, or TXT · Up to 5 MB')}</strong><label className="button secondary"><Upload size={16}/>{t('Upload CV')}<input className="setup-file" type="file" accept=".pdf,.docx,.txt" aria-label={t('Upload CV')} onChange={async e=>{
        const file=e.target.files?.[0];if(!file)return;const input=e.target;setBusy(true);setError('');
        try{const form=new FormData();form.append('cv',file);const response=await fetch('/api/cv',{method:'POST',body:form});const result=await response.json();if(!response.ok)throw new Error(result.error);setDraft(d=>({...d,answers:{...d.answers,cvText:result.text,cvFileName:result.name}}));setNotice(t(result.truncated?'CV extracted and shortened to 30,000 characters. Review it before saving.':'CV extracted. Review the text below, then continue.'));}
        catch(e){setError(e instanceof Error?e.message:t('Could not read CV.'));}finally{setBusy(false);input.value='';}
      }}/></label></div><label>{t('CV text')}<textarea rows={8} value={a.cvText} maxLength={30000} onChange={e=>update('cvText',e.target.value)} placeholder={t('Your experience, skills, and achievements…')}/></label></>}
      {step===2&&<><p id="question-hint">{t('Tell us in your own words. What would make your next role a good move?')}</p>{field('objective',5,3000,t('For example: a senior product role at a small climate company, preferably remote.'))}</>}
      {step===3&&<><p id="question-hint">{t('Your CV describes your past. Choose the roles you want next. One per line, up to four.')}</p>{field('titles',4,500)}<button type="button" className="text-button" onClick={()=>void suggest('roles')}>{t('Suggest roles from my CV')}</button></>}
      {step===4&&<><p id="question-hint">{t('Choose a location, or keep your search open worldwide.')}</p><div className="setup-choices">{(['anywhere','specific'] as const).map(value=><label key={value} className={a.locationChoice===value?'selected':''}><input type="radio" name="location" checked={a.locationChoice===value} onChange={()=>update('locationChoice',value)}/>{t(value==='anywhere'?'Anywhere':'Specific locations')}</label>)}</div>{a.locationChoice==='specific'&&field('locations',3,365,t('One per line, up to 3'))}</>}
      {step===5&&<><p id="question-hint">{t('Remote jobs can still have location and work-authorization restrictions.')}</p><div className="setup-choices">{(['remote','flexible'] as const).map(value=><label key={value} className={a.remotePreference===value?'selected':''}><input type="radio" name="remote" checked={a.remotePreference===value} onChange={()=>update('remotePreference',value)}/>{t(value==='remote'?'Remote only':'Also open to office work')}</label>)}</div></>}
      {step===6&&<><p id="question-hint">{t('Tell us only what you know, such as where you can work or where you need sponsorship. You can leave this blank.')}</p>{field('workAuthorization',4,1000)}</>}
      {step===7&&<><p id="question-hint">{t('Include the currency, pay period, and any flexibility. Leave blank if you are open.')}</p>{field('salaryExpectation',1,300,t('For example: €70,000–90,000 per year, flexible'))}</>}
      {step===8&&<><p id="question-hint">{t('Only add this if ownership matters to you. We will not assume an equity requirement.')}</p>{field('equityExpectation',3,500)}</>}
      {step===9&&<><p id="question-hint">{t('List only firm requirements or things you would rule out. Use your goal above for softer preferences.')}</p>{field('constraints',4,3000)}</>}
      {step===10&&<><p id="question-hint">{t('Searches run at least {count} hours apart. You can pause automatic searches later.',{count:minimum})}</p><label>{t('Search frequency')}<select value={a.intervalHours} onChange={e=>update('intervalHours',Number(e.target.value))}>{frequencies.map(hours=><option key={hours} value={hours}>{t('Every {count} hours',{count:hours})}</option>)}</select></label></>}
      {step===11&&<><p id="question-hint">{t('We will email new strong matches to your verified account address. You can change this later.')}</p><div className="setup-choices">{[true,false].map(value=><label key={String(value)} className={a.emailAlerts===value?'selected':''}><input type="radio" name="email" checked={a.emailAlerts===value} onChange={()=>update('emailAlerts',value)}/>{t(value?'Yes, email me strong matches':'No email alerts')}</label>)}</div></>}
      {step===12&&<>
        <p>{t('Review your answers. You can change any of them now or later in Search profile.')}</p>
        <div className="setup-summary">{questions.slice(0,12).map((question,index)=><div key={question}><div><span>{t(question)} {optional.has(index)&&<small>· {t('Optional')}</small>}</span><p>{values[index]||t('Not specified')}</p></div><button type="button" className="text-button" aria-label={t('Edit: {question}',{question:t(question)})} onClick={()=>{setReviewing(true);void move(index);}}>{t('Edit')}</button></div>)}</div>
        <section className="matching-summary"><span className="eyebrow">{t('HOW WE WILL MATCH YOU')}</span><h2>{t('Built around what matters to you')}</h2>{matchingCurrent?<p>{draft.matching!.summary}</p>:<p>{t('Generate your matching preferences from your CV and answers, or start with standard matching.')}</p>}
          {!matchingCurrent&&draft.matching&&<p>{t('Your answers changed. Update your matching preferences before saving.')}</p>}
          <div className="setup-matching-actions"><button type="button" className="button secondary" onClick={()=>void suggest('matching')}>{t(matchingCurrent?'Regenerate matching preferences':'Generate matching preferences')}</button><button type="button" className="text-button" onClick={()=>{setDraft(d=>({...d,matching:standardMatching(d.answers,locale)}));setError('');}}>{t('Use standard matching')}</button></div>
          <p className="footnote">{t('Your explicit dealbreakers remain requirements. Missing information stays unknown.')}</p>
        </section>
        {onboarding&&<p className="footnote">{t('Finishing enables scheduled searches at your chosen frequency. Results appear when the search service is connected.')}</p>}
      </>}
      </fieldset>
      {busy&&<p role="status" className="setup-status">{t('Working on it…')}</p>}
      {notice&&<p role="status" className="setup-status">{notice}</p>}
      {error&&<p role="alert" className="error-text setup-status">{error}</p>}
      {verificationNeeded&&alerts}
      <div className="setup-navigation">
        {step>0&&step<12&&<button type="button" className="text-button" disabled={busy} onClick={()=>void move(reviewing?12:step-1)}><ArrowLeft size={16}/>{t(reviewing?'Back to review':'Back')}</button>}
        {step===12&&onboarding&&<button type="button" className="text-button" disabled={busy} onClick={()=>void move(11)}><ArrowLeft size={16}/>{t('Back')}</button>}
        <div className="setup-forward">{optional.has(step)&&<button type="button" className="text-button" disabled={busy} onClick={()=>void move(reviewing?12:step+1,true)}>{t('Skip for now')}</button>}<button className="button primary" disabled={busy}>{t(step===12?(onboarding?'Finish setup':'Save search profile'):reviewing?'Done':'Next')}<ArrowRight size={17}/></button></div>
      </div>
    </form>
  </section>;
}
