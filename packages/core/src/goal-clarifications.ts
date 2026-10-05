import {z} from 'zod';
import {translate} from './i18n';
import type {Locale} from './i18n/locale';

export const clarificationQuestionSchema=z.object({
  id:z.string().regex(/^[a-z][a-z0-9_]{0,29}$/),
  question:z.string().trim().min(10).max(240),
  why:z.string().trim().min(10).max(300),
  options:z.array(z.string().trim().min(1).max(160)).max(4),
});
export const goalClarificationSchema=clarificationQuestionSchema.extend({
  answer:z.string().trim().max(1200).default(''),
  importance:z.enum(['preference','requirement']).default('preference'),
});
export const goalClarificationsSchema=z.array(goalClarificationSchema).max(3).superRefine((questions,ctx)=>{
  if(new Set(questions.map(q=>q.id)).size!==questions.length)ctx.addIssue({code:'custom',message:'Each clarification needs a unique ID.'});
});
export const clarificationProposalSchema=z.object({questions:z.array(clarificationQuestionSchema).max(3)}).superRefine((proposal,ctx)=>{
  if(new Set(proposal.questions.map(q=>q.id)).size!==proposal.questions.length)ctx.addIssue({code:'custom',message:'Each clarification needs a unique ID.'});
});
export type GoalClarification=z.infer<typeof goalClarificationSchema>;
type Context={cvText:string;objective:string;goalClarifications?:GoalClarification[];clarificationBasis?:string};
export function clarificationBasis(a:Pick<Context,'cvText'|'objective'>){return JSON.stringify([a.cvText.trim(),a.objective.trim()]);}
export function currentClarifications(a:Context){return a.clarificationBasis===clarificationBasis(a)?a.goalClarifications||[]:[];}
export function answeredClarifications(a:Context){return currentClarifications(a).filter(q=>q.answer.trim());}
export function staleClarifications(a:Context){return Boolean(a.goalClarifications?.some(q=>q.answer.trim())&&a.clarificationBasis!==clarificationBasis(a));}
export function mergeClarificationQuestions(a:Context,questions:GoalClarification[]){
 const preserved=answeredClarifications(a);
 return [...preserved,...questions.filter(q=>!preserved.some(old=>old.id===q.id||old.question===q.question))].slice(0,3);
}
export function standardClarifications(locale:Locale):GoalClarification[]{
  return [
    {id:'priority',question:translate(locale,'Which priority should win when two opportunities involve a trade-off?'),why:translate(locale,'This helps us compare opportunities using what matters most to you.'),options:[]},
    {id:'limits',question:translate(locale,'Are there any limits on hours, schedule, contract type, or responsibilities?'),why:translate(locale,'This helps us distinguish preferences from conditions a role must meet.'),options:[]},
  ].map(q=>({...q,answer:'',importance:'preference'}));
}
