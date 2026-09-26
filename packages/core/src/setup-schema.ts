import { z } from 'zod';
import { strategySchema } from './strategy';

// Drafts deliberately allow incomplete answers; completion is validated separately.
export const setupAnswersSchema = z.object({
  name:z.string().max(100), cvText:z.string().max(30000), cvFileName:z.string().max(200),
  objective:z.string().max(3000), titles:z.string().max(500), locations:z.string().max(365),
  locationChoice:z.enum(['','anywhere','specific']), remotePreference:z.enum(['','remote','flexible']),
  workAuthorization:z.string().max(1000), salaryExpectation:z.string().max(300),
  equityExpectation:z.string().max(500), constraints:z.string().max(3000),
  intervalHours:z.number().int().min(1).max(168), emailAlerts:z.boolean(),
});
export type SetupAnswers = z.infer<typeof setupAnswersSchema>;
export const matchingDraftSchema = z.object({
  basis:z.string().max(80000), strategy:strategySchema, summary:z.string().max(1200),
  kind:z.enum(['generated','standard','existing']),
});
export const setupDraftSchema = z.object({
  step:z.number().int().min(0).max(12), answers:setupAnswersSchema,
  matching:matchingDraftSchema.nullable(),
});
export type SetupDraft = z.infer<typeof setupDraftSchema>;
export function matchingBasis(a:SetupAnswers) {
  return JSON.stringify([a.cvText.trim(),a.objective.trim(),a.titles.trim(),a.locationChoice,a.locations.trim(),a.remotePreference,a.workAuthorization.trim(),a.salaryExpectation.trim(),a.equityExpectation.trim(),a.constraints.trim()]);
}
export const lines = (value:string) => [...new Set(value.split('\n').map(s=>s.trim()).filter(Boolean))];
export function setupStepError(step:number,a:SetupAnswers,minimum:number):string|null {
  if(step===1&&a.cvText.trim().length<100)return 'Add at least 100 characters of CV text or experience.';
  if(step===2&&a.objective.trim().length<10)return 'Tell us what you want in at least 10 characters.';
  if(step===3&&(!lines(a.titles).length||lines(a.titles).length>4||lines(a.titles).some(s=>s.length<2||s.length>120)))return 'Choose 1–4 target roles, one per line.';
  if(step===4&&(!a.locationChoice||(a.locationChoice==='specific'&&(!lines(a.locations).length||lines(a.locations).length>3||lines(a.locations).some(s=>s.length>120)))))return 'Choose Anywhere or enter 1–3 search locations.';
  if(step===5&&!a.remotePreference)return 'Choose your work preference.';
  if(step===10&&(!Number.isInteger(a.intervalHours)||a.intervalHours<minimum||a.intervalHours>168))return 'Choose a search frequency at or above the minimum.';
  return null;
}
export function firstIncompleteStep(a:SetupAnswers,minimum:number) {
  for(let step=0;step<12;step++)if(setupStepError(step,a,minimum))return step;
  return null;
}
