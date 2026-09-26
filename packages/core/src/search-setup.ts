import type { Profile } from './profile';
import { profileSchema } from './profile';
import { defaultStrategy, type Strategy } from './strategy';
import { translate } from './i18n';
import { firstIncompleteStep, lines, matchingBasis, type SetupAnswers, type SetupDraft } from './setup-schema';

export function answersFromProfile(p:Profile):SetupAnswers {
  return {name:p.name,cvText:p.cvText,cvFileName:p.cvFileName,objective:p.onboardingCompleted?p.objective:'',
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
  return {basis:matchingBasis(a),kind:'standard',strategy:strategyForAnswers(a,defaultStrategy.groups.map(g=>({...g,label:translate(locale,g.label),criteria:g.criteria.map(c=>({...c,label:translate(locale,c.label),rubric:translate(locale,c.rubric)}))})),locale),summary:translate(locale,'We match your experience, target roles, career goals, and working preferences. Unstated details stay unknown.')};
}
// Hard requirements come only from the user's explicit answers, never from the CV or AI.
export function strategyForAnswers(a:SetupAnswers,groups:Strategy['groups'],locale:'en'|'es'):Strategy {
  const requirements:Strategy['requirements']=[];
  if(a.constraints.trim()) {
    requirements.push({id:'user_dealbreakers',label:translate(locale,'Must-haves and dealbreakers'),instruction:`Apply only explicitly stated must-haves; do not invent exclusions. User answer: ${a.constraints.trim()}`,unknown:'research'});
  }
  if(a.workAuthorization.trim())requirements.push({id:'user_work_access',label:translate(locale,'Work authorization'),instruction:`Use only this declared work-access requirement; never infer authorization from citizenship or a CV. User answer: ${a.workAuthorization.trim()}`,unknown:'research'});
  return {...defaultStrategy,groups,requirements};
}
export function completeSetup(p:Profile,draft:SetupDraft,minimum:number,email:string,verified:boolean):Profile {
  const step=firstIncompleteStep(draft.answers,minimum);
  if(step!==null)throw new Error('Complete the required questions before finishing.');
  if(!draft.matching||draft.matching.basis!==matchingBasis(draft.answers))throw new Error('Update your matching preferences or choose standard matching.');
  const a=draft.answers;
  return profileSchema.parse({...p,name:a.name,cvText:a.cvText,cvFileName:a.cvFileName,objective:a.objective,
    titles:lines(a.titles),locations:a.locationChoice==='anywhere'?['']:lines(a.locations),remoteOnly:a.remotePreference==='remote',
    workAuthorization:a.workAuthorization,salaryExpectation:a.salaryExpectation,equityExpectation:a.equityExpectation,
    constraints:a.constraints,intervalHours:a.intervalHours,email,emailAlertsRequested:a.emailAlerts,emailEnabled:a.emailAlerts&&verified,
    strategy:draft.matching.strategy,matchingSummary:draft.matching.summary,onboardingCompleted:true,setupDraft:null,
    enabled:p.onboardingCompleted?p.enabled:true});
}
