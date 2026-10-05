import type { Profile } from './profile';
import { profileSchema } from './profile';
import { defaultStrategy, type Strategy } from './strategy';
import {locationQuery} from './locations';
import type {Discovery} from './discovery';
import {countryCodes} from './locations';
import { translate } from './i18n';
import {answeredClarifications,currentClarifications} from './goal-clarifications';
import { firstIncompleteStep, lines, matchingBasis, type SetupAnswers, type SetupDraft } from './setup-schema';

export function answersFromProfile(p:Profile):SetupAnswers {
  return {goalClarifications:p.goalClarifications,clarificationBasis:p.clarificationBasis,selectedLocations:p.searchLocations,rolesBasis:'',name:p.name,cvText:p.cvText,cvFileName:p.cvFileName,objective:p.onboardingCompleted?p.objective:'',
    titles:p.onboardingCompleted?p.titles.join('\n'):'',locations:p.locations.filter(Boolean).join('\n'),
    locationChoice:p.onboardingCompleted?(p.locations.some(Boolean)?'specific':'anywhere'):'',
    remotePreference:p.onboardingCompleted?(p.remoteOnly?'remote':'flexible'):'',workAuthorization:p.workAuthorization,
    salaryExpectation:p.salaryExpectation,equityExpectation:p.equityExpectation,constraints:p.constraints,
    intervalHours:p.intervalHours,emailAlerts:p.emailAlertsRequested||p.emailEnabled};
}
export function draftFromProfile(p:Profile,minimum:number):SetupDraft {
  if(p.setupDraft)return {...p.setupDraft,answers:{...p.setupDraft.answers,intervalHours:Math.max(minimum,p.setupDraft.answers.intervalHours)}};
  const answers=answersFromProfile(p);answers.intervalHours=Math.max(minimum,answers.intervalHours);
  return {step:0,answers,matching:p.onboardingCompleted?{basis:matchingBasis(answers),strategy:p.strategy,summary:p.matchingSummary||translate(p.outputLanguage,'Your current matching preferences are saved.'),kind:'existing'}:null};
}
export function standardMatching(a:SetupAnswers,locale:'en'|'es'):SetupDraft['matching'] {
  const clarified=answeredClarifications(a);
  const discovery=clarified.length?{intent:a.objective.trim().slice(0,1200),titleVariants:[],evidencePriorities:clarified.map(q=>`${q.question} ${q.answer}`.slice(0,300)),questions:currentClarifications(a).filter(q=>!q.answer).map(q=>q.question)}:null;
  return {basis:matchingBasis(a),kind:'standard',strategy:strategyForAnswers(a,defaultStrategy.groups.map(g=>({...g,label:translate(locale,g.label),criteria:g.criteria.map(c=>({...c,label:translate(locale,c.label),rubric:translate(locale,c.rubric)}))})),locale,discovery),summary:translate(locale,'We match your experience, target roles, career goals, and working preferences. Unstated details stay unknown.')};
}
// Hard requirements come only from the user's explicit answers, never from the CV or AI.
export function strategyForAnswers(a:SetupAnswers,groups:Strategy['groups'],locale:'en'|'es',discovery:Discovery|null=null,workAccess:Strategy['workAccess']=[]):Strategy {
  const requirements:Strategy['requirements']=[];
  for(const q of answeredClarifications(a).filter(q=>q.importance==='requirement'))requirements.push({id:`goal_${q.id}`,label:q.question.slice(0,120),instruction:`Apply only the user's explicit answer to this question; do not treat suggested choices or the question itself as requirements. Question: ${q.question}\nUser answer: ${q.answer}`,unknown:'research'});
  if(a.constraints.trim()) {
    requirements.push({id:'user_dealbreakers',label:translate(locale,'Must-haves and dealbreakers'),instruction:`Apply only explicitly stated must-haves; do not invent exclusions. User answer: ${a.constraints.trim()}`,unknown:'research'});
  }
  const accessCoversLocations=a.selectedLocations.length>0&&a.selectedLocations.every(place=>workAccess.some(rule=>rule.country===place.countryCode));
  if(a.workAuthorization.trim()&&!accessCoversLocations)requirements.push({id:'user_work_access',label:translate(locale,'Work authorization'),instruction:`Use only the user's declared work-access policy; never infer authorization from citizenship or a CV. A job need not restate the candidate's own work rights. Use available location evidence. If the user explicitly accepts unstated sponsorship in a country, silence alone is not a failure or an unknown requirement. For alternative locations, an accessible location may satisfy the policy. User answer: ${a.workAuthorization.trim()}`,unknown:'research'});
  return {...defaultStrategy,groups,requirements,discovery,workAccess:workAccess.filter(rule=>countryCodes.includes(rule.country))};
}
export function completeSetup(p:Profile,draft:SetupDraft,minimum:number,email:string,verified:boolean):Profile {
  const step=firstIncompleteStep(draft.answers,minimum);
  if(step!==null)throw new Error('Complete the required questions before finishing.');
  if(!draft.matching||draft.matching.basis!==matchingBasis(draft.answers))throw new Error('Update your matching preferences or choose standard matching.');
  const a=draft.answers;
  return profileSchema.parse({...p,name:a.name,cvText:a.cvText,cvFileName:a.cvFileName,objective:a.objective,
    goalClarifications:currentClarifications(a),clarificationBasis:a.clarificationBasis,
    titles:lines(a.titles),searchLocations:a.selectedLocations,locations:a.selectedLocations.map(locationQuery),remoteOnly:a.remotePreference==='remote',
    workAuthorization:a.workAuthorization,salaryExpectation:a.salaryExpectation,equityExpectation:a.equityExpectation,
    constraints:a.constraints,intervalHours:a.intervalHours,email,emailAlertsRequested:a.emailAlerts,emailEnabled:a.emailAlerts&&verified,
    strategy:draft.matching.strategy,matchingSummary:draft.matching.summary,onboardingCompleted:true,setupDraft:null,
    enabled:p.onboardingCompleted?p.enabled:true});
}
