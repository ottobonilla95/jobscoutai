'use client';
import {useState} from 'react';
import type {SetupDraft} from '@core/setup-schema';
import {useI18n} from './i18n';

export default function StrategyReview({matching,onChange}:{matching:NonNullable<SetupDraft['matching']>;onChange:(matching:NonNullable<SetupDraft['matching']>)=>void}){
 const {t,locale}=useI18n();const {strategy}=matching,plan=strategy.discovery;
 function updatePlan(key:'intent'|'titleVariants'|'evidencePriorities',value:string){
  if(!plan)return;
  onChange({...matching,strategy:{...strategy,discovery:{...plan,[key]:key==='intent'?value:value.split('\n').map(s=>s.trim()).filter(Boolean)}}});
 }
 return <div className="strategy-review">
  <label>{t('What we understand you want')}<textarea rows={4} maxLength={1200} value={matching.summary} onChange={event=>onChange({...matching,summary:event.target.value})}/><small>{t('Review this interpretation before saving. Edit anything that does not reflect your goals.')}</small></label>
  {plan&&<>
   <PlanField key={`intent-${plan.intent}`} label={t('What we will look for')} value={plan.intent} limit={1200} rows={3} onCommit={value=>updatePlan('intent',value)}/>
   <PlanField key={`titles-${plan.titleVariants.join('|')}`} label={t('Equivalent search titles')} value={plan.titleVariants.join('\n')} limit={950} rows={3} maxLines={8} hint={t('One per line, up to 8. Your confirmed roles take priority; each search uses up to 8 titles in total.')} onCommit={value=>updatePlan('titleVariants',value)}/>
   <PlanField key={`evidence-${plan.evidencePriorities.join('|')}`} label={t('Evidence we will check')} value={plan.evidencePriorities.join('\n')} limit={1800} rows={4} maxLines={6} hint={t('One per line, up to 6. Missing facts stay unresolved; listing screening does not investigate other websites.')} onCommit={value=>updatePlan('evidencePriorities',value)}/>
   {plan.questions.length>0&&<div><strong>{t('Still to clarify')}</strong><ul>{plan.questions.map(question=><li key={question}>{question}</li>)}</ul><p className="footnote">{t('You can clarify these in your answers above. We will not assume an answer.')}</p></div>}
  </>}
  {strategy.workAccess.length>0&&<div><strong>{t('Review your declared work access')}</strong><p className="footnote">{t('These rules come from your work-authorization answer. Check each country before confirming.')}</p>
   {strategy.workAccess.map((rule,index)=><div className="access-review" key={rule.country}>
    <span>{new Intl.DisplayNames([locale],{type:'region'}).of(rule.country)}</span>
    <label>{t('Work access')}<select value={rule.access} onChange={event=>onChange({...matching,strategy:{...strategy,workAccess:strategy.workAccess.map((r,i)=>i===index?{...r,access:event.target.value as 'authorized'|'sponsorship'}:r)}})}><option value="authorized">{t('I can work here without sponsorship')}</option><option value="sponsorship">{t('I need sponsorship')}</option></select></label>
    {rule.access==='sponsorship'&&<label>{t('If sponsorship is not mentioned')}<select value={rule.unknownSponsorship} onChange={event=>onChange({...matching,strategy:{...strategy,workAccess:strategy.workAccess.map((r,i)=>i===index?{...r,unknownSponsorship:event.target.value as 'allow'|'research'|'exclude'}:r)}})}><option value="allow">{t('Keep and verify')}</option><option value="research">{t('Research first')}</option><option value="exclude">{t('Exclude')}</option></select></label>}
   </div>)}
  </div>}
 </div>;
}

function PlanField({label,value,limit,rows,maxLines,hint,onCommit}:{label:string;value:string;limit:number;rows:number;maxLines?:number;hint?:string;onCommit:(value:string)=>void}){
 const {t}=useI18n();const [text,setText]=useState(value),[invalid,setInvalid]=useState(false);
 return <label>{label}<textarea value={text} rows={rows} maxLength={limit} aria-invalid={invalid} onChange={event=>{const next=event.target.value;setText(next);const lines=next.split('\n').map(s=>s.trim()).filter(Boolean);const valid=maxLines?lines.length<=maxLines&&lines.every(line=>line.length>=(maxLines===8?2:5)&&line.length<=(maxLines===8?120:300)):next.trim().length>=10;event.target.setCustomValidity(valid?'':t('Enter valid search titles and evidence priorities.'));setInvalid(!valid);}}
  onBlur={()=>{
   const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
   const valid=maxLines?lines.length<=maxLines&&lines.every(line=>line.length>=(maxLines===8?2:5)&&line.length<=(maxLines===8?120:300)):text.trim().length>=10;
   setInvalid(!valid);if(valid)onCommit(text.trim());
  }}/>{hint&&<small>{hint}</small>}{invalid&&<span role="alert">{t('Enter valid search titles and evidence priorities.')}</span>}</label>;
}
