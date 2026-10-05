import { z } from 'zod';
import { strategySchema } from './strategy';
import {searchLocationSchema,maxSearchLocations,maxLocationTextLength,locationQuery} from './locations';
import {answeredClarifications,goalClarificationsSchema,staleClarifications} from './goal-clarifications';

// Drafts deliberately allow incomplete answers; completion is validated separately.
export const setupAnswersSchema = z.object({
  name:z.string().max(100), cvText:z.string().max(30000), cvFileName:z.string().max(200),
  selectedLocations:z.array(searchLocationSchema).max(maxSearchLocations).default([]),
  rolesBasis:z.string().max(100000).default(''),
  goalClarifications:goalClarificationsSchema.default([]), clarificationBasis:z.string().max(70000).default(''),
  objective:z.string().max(3000), titles:z.string().max(500), locations:z.string().max(maxLocationTextLength),
  locationChoice:z.enum(['','anywhere','specific']), remotePreference:z.enum(['','remote','flexible']),
  workAuthorization:z.string().max(1000), salaryExpectation:z.string().max(300),
  equityExpectation:z.string().max(500), constraints:z.string().max(3000),
  intervalHours:z.number().int().min(1).max(168), emailAlerts:z.boolean(),
});
export type SetupAnswers = z.infer<typeof setupAnswersSchema>;
export const matchingDraftSchema = z.object({
  basis:z.string().max(100000), strategy:strategySchema, summary:z.string().max(1200),
  kind:z.enum(['generated','standard','existing']),
});
export const setupDraftSchema = z.object({
  step:z.number().int().min(0).max(12), answers:setupAnswersSchema,
  matching:matchingDraftSchema.nullable(),
});
export type SetupDraft = z.infer<typeof setupDraftSchema>;
export function matchingBasis(a:SetupAnswers) {
  const values:unknown[]=[a.cvText.trim(),a.objective.trim(),a.titles.trim(),a.selectedLocations.length?a.selectedLocations.map(locationQuery).join('\n'):a.locationChoice,a.selectedLocations.length?'':a.locations.trim(),a.remotePreference,a.workAuthorization.trim(),a.salaryExpectation.trim(),a.equityExpectation.trim(),a.constraints.trim()];
  const clarifications=answeredClarifications(a);if(clarifications.length)values.push(clarifications.map(({id,question,answer,importance})=>({id,question,answer,importance})));
  return JSON.stringify(values);
}
export function rolesBasis(a:Pick<SetupAnswers,'cvText'|'objective'>&Partial<Pick<SetupAnswers,'goalClarifications'|'clarificationBasis'>>){
  const values:unknown[]=[a.cvText.trim(),a.objective.trim()];const clarifications=answeredClarifications(a);if(clarifications.length)values.push(clarifications.map(({question,answer,importance})=>({question,answer,importance})));
  return JSON.stringify(values);
}
export const lines = (value:string) => [...new Set(value.split('\n').map(s=>s.trim()).filter(Boolean))];
export function setupStepError(step:number,a:SetupAnswers,minimum:number):string|null {
  if(step===1&&a.cvText.trim().length<100)return 'Add at least 100 characters of CV text or experience.';
  if(step===2&&a.objective.trim().length<10)return 'Tell us what you want in at least 10 characters.';
  if(step===2&&staleClarifications(a))return 'Your goal or CV changed. Refresh the follow-up questions or clear the previous answers.';
  if(step===3&&(!lines(a.titles).length||lines(a.titles).length>4||lines(a.titles).some(s=>s.length<2||s.length>120)))return 'Choose 1–4 target roles, one per line.';
  if(step===4&&!a.selectedLocations.length)return 'Select at least one country or city from the suggestions.';
  if(step===4&&a.selectedLocations.length>maxSearchLocations)return `Select up to ${maxSearchLocations} countries or cities.`;
  if(step===5&&!a.remotePreference)return 'Choose your work preference.';
  if(step===10&&(!Number.isInteger(a.intervalHours)||a.intervalHours<minimum||a.intervalHours>168))return 'Choose a search frequency at or above the minimum.';
  return null;
}
export function firstIncompleteStep(a:SetupAnswers,minimum:number) {
  for(let step=0;step<12;step++)if(setupStepError(step,a,minimum))return step;
  return null;
}
