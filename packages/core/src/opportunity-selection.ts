import type {Job, Profile} from './profile';
import {recommendation, strongMatch} from './recommendation';
import {sourceEnabled} from './source-settings';

export function qualifiedOpportunity(job:Job, profile:Profile, version:number) {
  return sourceEnabled(profile,job.sourceKey) && strongMatch(job,profile,version);
}

/** The daily feed contains decisions the user can act on now. */
export function readyOpportunity(job:Job,profile:Profile,version:number){
 return qualifiedOpportunity(job,profile,version)&&job.assessment?.eligibility==='eligible'&&
   job.assessment.evaluation?.decision==='apply'&&recommendation(job)==='apply'&&
   job.verification?.status==='open'&&Boolean(job.verification.applicationUrl);
}

export function promisingResearch(job:Job, profile:Profile, version:number) {
  const evidence=job.assessment?.evaluation;
  const supported=evidence?.components.filter(c=>c.score!==null&&c.score>=4&&c.evidence).length??0;
  const enoughEvidence=!evidence || ((supported>=2 || (evidence.components.length===1&&supported===1)) && (evidence.evidenceCoverage??0)>=25);
  const researchFit=enoughEvidence && job.assessment && (job.assessment.score>=profile.minimumScore || (job.assessment.score>=Math.max(60,profile.minimumScore-15) && supported>=2 && (evidence?.evidenceCoverage??0)>=25));
  return sourceEnabled(profile,job.sourceKey) && job.status!=='dismissed' &&
    job.evaluatedVersion===version && Boolean(job.assessment && !job.assessment.researchReviewed &&
      researchFit && (job.assessment.concerns.some(concern=>concern.trim()) || evidence?.gates.some(g=>g.action==='research') || evidence?.components.some(c=>c.score===null))) &&
    recommendation(job)==='research';
}

/** Discovery records are an internal evaluation queue, never an opportunity feed. */
export function opportunitiesForView(jobs:Job[], profile:Profile, version:number, view:string, source='all') {
  const selected=jobs.filter(job=>source==='all'||(job.sourceKey||'linkedin')===source).filter(job=>{
    if(view==='dismissed')return job.status==='dismissed';
    if(job.status==='dismissed')return false;
    if(view==='saved')return job.status==='saved';
    if(view==='research')return promisingResearch(job,profile,version);
    if(view==='applications')return ['applied','interviewing','offer'].includes(job.tracking?.stage||'');
    if(view==='followups')return Boolean(job.tracking?.followUp && job.tracking.followUp<=new Date().toISOString().slice(0,10));
    return readyOpportunity(job,profile,version);
  });
  return view==='all'?selected.sort((a,b)=>b.firstSeen.localeCompare(a.firstSeen)||((b.assessment?.score||0)-(a.assessment?.score||0))):selected;
}
