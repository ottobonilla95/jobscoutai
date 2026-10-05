'use client';
import type {SetupAnswers} from '@core/setup-schema';
import {clarificationBasis,staleClarifications,type GoalClarification} from '@core/goal-clarifications';
import {useI18n} from './i18n';

type Props={answers:SetupAnswers;onChange:(questions:GoalClarification[])=>void;onGenerate:()=>void;onClear:()=>void;onSkip?:()=>void};
export default function GoalClarifications({answers:a,onChange,onGenerate,onClear,onSkip}:Props){
 const {t}=useI18n();const stale=staleClarifications(a);
 const current=a.clarificationBasis===clarificationBasis(a);
 function change(index:number,patch:Partial<GoalClarification>){onChange(a.goalClarifications.map((q,i)=>i===index?{...q,...patch}:q));}
 return <section className="goal-clarifications" aria-label={t('Clarify what matters to you')}>
  <h2>{t('Clarify what matters to you')}</h2>
  <p className="footnote">{t('A few optional questions help us understand your priorities. Answer what helps; leave anything uncertain blank.')}</p>
  {stale&&<p role="status" className="footnote">{t('Your goal or CV changed. These previous answers are not being used. Replace the questions or clear the answers to continue.')}</p>}
  <fieldset disabled={!current} className="goal-question-fields">
   {a.goalClarifications.map((q,index)=><div className="goal-question" key={q.id}>
    <label htmlFor={`goal-question-${q.id}`}><span>{q.question}</span><small>{q.why}</small></label>
    {q.options.length>0&&<div className="goal-answer-options" role="group" aria-label={q.question}>{q.options.map(option=><button key={option} type="button" className="button secondary" aria-pressed={q.answer===option} onClick={()=>change(index,{answer:option})}>{option}</button>)}</div>}
    <textarea id={`goal-question-${q.id}`} rows={2} maxLength={1200} value={q.answer} onChange={event=>change(index,{answer:event.target.value,...(!event.target.value.trim()?{importance:'preference' as const}:{})})} placeholder={t('Answer in your own words, or leave blank.')}/>
    <label className="check-label"><input type="checkbox" disabled={!q.answer.trim()} checked={Boolean(q.answer.trim())&&q.importance==='requirement'} onChange={event=>change(index,{importance:event.target.checked?'requirement':'preference'})}/><span>{t('This is a firm requirement')}<small>{t('Otherwise, we treat your answer as a preference and compare trade-offs.')}</small></span></label>
   </div>)}
  </fieldset>
  {current&&!a.goalClarifications.length&&<p role="status" className="footnote">{t('Your goal is clear enough to continue. You can add detail to your description at any time.')}</p>}
  <div className="goal-question-actions">
   {(!current||a.goalClarifications.filter(q=>q.answer.trim()).length<3)&&<button type="button" className="button secondary" onClick={onGenerate}>{t(stale?'Replace outdated questions':current?'Refresh follow-up questions':'Ask useful follow-up questions')}</button>}
   {a.goalClarifications.length>0&&<button type="button" className="text-button" onClick={onClear}>{t('Clear follow-up questions and answers')}</button>}
   {onSkip&&!stale&&<button type="button" className="text-button" onClick={onSkip}>{t('Continue with my current answers')}</button>}
  </div>
 </section>;
}
