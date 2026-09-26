import type { Job, Profile } from './profile';
import type { Decision } from './strategy';
export function recommendation(job:Job):Decision {
 if(job.verification?.status==='closed'||job.duplicateOf||job.assessment?.eligibility==='ineligible'||job.assessment?.evaluation?.decision==='exclude')return 'exclude';
 const manual=job.tracking?.recommendation;
 let decision:Decision=manual&&manual!=='automatic'?manual:job.assessment?.evaluation?.decision||(!job.assessment?'research':job.assessment.eligibility==='uncertain'?'apply_verify':'apply');
 if(decision==='apply'&&(!job.verification||job.verification.status!=='open'||Date.now()-Date.parse(job.verification.checkedAt)>14*86400000))decision='apply_verify';
 return decision;
}
export function strongMatch(job:Job,profile:Profile,version:number){return job.status!=='dismissed'&&job.evaluatedVersion===version&&Boolean(job.assessment&&job.assessment.score>=profile.minimumScore)&&['apply','apply_verify'].includes(recommendation(job));}
export const recommendationLabels={apply:'Apply',apply_verify:'Apply + verify',research:'Research',exclude:'Exclude'};
