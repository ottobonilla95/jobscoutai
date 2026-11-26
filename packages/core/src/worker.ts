import {ResearchTasks} from './research-tasks';
import type {ResearchStats} from './research-task-schema';
import {investigateOpportunity,dueForInvestigation} from './investigator';
import { AIBudgetError,providerBalanceExhausted,remainingGenerations } from './ai-usage';
import {Accounts} from './accounts';
import { integrations } from './config';
import { verifyListing } from './verification';
import { strongMatch,recommendation } from './recommendation';
import { SourceError } from './linkedin';
import { searchSources, listingWithinAge, describeJob, type SearchReport } from './sources';
import type { JobListing, Profile } from './profile';
import { rankJob,checkedRoleEvidence } from './ranker';
import { notifyMatches } from './notifications';
import { type Store } from './store';
import {planAdaptiveSearch,fallbackPage,type AdaptivePlan,type PlannerInput} from './adaptive-planner';
import {discoveryScope,freshDiscoveryState} from './discovery-state';
import type {SearchDiscovery} from './adaptive-search-schema';
import {queryKey,locationCoverage,type SearchSession} from './search-session';
import {loadPublicJob} from './public-job';
import {createHash} from 'node:crypto';
import {searchTargets} from './search-plan';
import {searchTitles,matchesTitle} from './discovery';
import {activeCountrySources} from './country-sources';
import {parseBoard} from './source-settings';
import {loadCompanyBoard} from './company-board';
import {searchQuery} from './search-session';
import {promisingResearch} from './opportunity-selection';

const defaults = { verify: verifyListing, search: (profile:Profile,session?:SearchSession)=>searchSources(profile,undefined,session), describe: describeJob, rank: rankJob, notify: notifyMatches,plan:planAdaptiveSearch,investigate:investigateOpportunity };
type Dependencies={investigate?:typeof investigateOpportunity;search:(profile:Profile,session?:SearchSession)=>Promise<SearchReport|JobListing[]>;describe:typeof describeJob;rank:typeof rankJob;notify:typeof notifyMatches;verify?:typeof verifyListing;plan?:(input:PlannerInput)=>Promise<AdaptivePlan>};
export async function runSearch({ store, force = false, accountId, canNotify = true, dependencies = defaults }: {
  store: Store; force?: boolean; canNotify?:boolean; accountId?:string; dependencies?:Dependencies;
}) {
  await store.heartbeat();
  const budgetProfile=(await store.profile()).profile;
  const generationBudget=await remainingGenerations(store.userId,budgetProfile.dailyEvaluationLimit,new Accounts(store.db));
  const id=await store.claim(force);if(!id)return {status:'idle' as const};
  const started=Date.now();
  const {profile,version}=await store.profile();
  const scope=discoveryScope(profile);
  let state=freshDiscoveryState(await store.discoveryState(scope));
  const counts={discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0};
  const research:ResearchStats={attempted:0,completed:0,resumed:0,verifiedEvidence:0,answered:0,unresolved:0,retryScheduled:0,failed:0,stopReason:profile.researchEnabled?'finished':'disabled'};
  const targetLabel=(target:{location:string;workMode?:string})=>target.workMode&&target.workMode!=='any'?`${target.location} · ${target.workMode}`:target.location;
  const report:SearchDiscovery={profileVersion:version,rounds:[],requests:0,requestLimit:24,stopReason:'round_limit',coverage:locationCoverage(searchTargets(profile).map(t=>targetLabel(t)),[])};
  const session:SearchSession={round:0,page:0,remaining:24,deadline:started+8*60000,seen:new Set(),blocked:new Set(),history:new Map(state.attempts.map(a=>[queryKey(a),a.checkedAt])),successful:new Set(state.attempts.filter(a=>a.status==='ok'&&a.scope?.status!=='mismatch').map(queryKey)),cache:new Map(),perSource:new Map(),perSourceLimit:6,attempts:[],items:[]};
  // Search endpoint throttling does not imply that an individual listing page
  // is unreadable. Keep description failures separate from search blocks.
  const descriptionBlocked=new Set<string>();
  const errors:string[]=[];let failed=false,hadSuccess=false,aiUnavailable=false;
  const existingJobs=await store.jobs();
  const known=new Set(existingJobs.map(j=>j.id)),seen=new Set<string>(),evaluated=new Set<string>(),newCandidates=new Set<string>(),verified=new Set<string>();
  const verificationLimit=10;
  const needsVerification=(job:typeof existingJobs[number])=>{
    if(job.verification?.status==='closed')return false;
    const age=Date.now()-Date.parse(job.verification?.checkedAt||'');
    return !job.verification||!Number.isFinite(age)||age>(job.verification.status==='open'?14:1)*86400000;
  };
  if(profile.researchEnabled&&generationBudget===0)research.stopReason='daily_budget';
  const evaluationLimit=Math.max(0,Math.min(profile.maxJobsPerRun,profile.dailyEvaluationLimit-await store.evaluatedToday(),generationBudget));
  const needsResearchReview=(job:typeof existingJobs[number])=>Boolean(job.assessment&&job.researchTask?.status==='completed'&&job.research?.profileVersion===version&&job.research.generationIds.length&&job.research.generationIds.at(-1)!==job.assessment.researchGenerationId);
  const pendingCount=(await store.pending(version,30,profile)).length;
  const researchCandidates=existingJobs.filter(j=>needsResearchReview(j)||promisingResearch(j,profile,version)).length;
  const researchReserve=profile.researchEnabled?Math.min(pendingCount>=evaluationLimit?1:4,pendingCount?Math.max(0,evaluationLimit-1):evaluationLimit,researchCandidates):0;
  const discoveryEvaluationLimit=evaluationLimit-researchReserve;
  const backlogOnly=pendingCount>0&&generationBudget<=2;
  let searchProfile=profile,plan:AdaptivePlan|null=null;
  const heartbeat=setInterval(()=>{void store.heartbeat(id).catch(()=>console.error('Worker heartbeat failed.'));},30000);
  const current=async()=> (await store.profile()).version===version;
  const verify=async(job:Awaited<ReturnType<Store['jobs']>>[number])=>{
    if(!dependencies.verify)return;
    const result=await dependencies.verify(job.url,undefined,{job,deadline:session.deadline,readBoard:board=>{
      if(!profile.sources.includes('companies'))throw new Error('Company board recovery is disabled.');
      const query={source:board.key,query:'*',location:'',page:0};
      return searchQuery(session,query,()=>loadCompanyBoard(board)).then(jobs=>{
        if(!session.cache.has(queryKey(query)))throw new Error('No source budget remains for board recovery.');
        return jobs;
      });
    }});
    if(!await current())return;
    const {replacement,...verification}=result;
    if(replacement)await store.recoverListingRoute(job.id,job.url,replacement,verification,version);
    else await store.verify(job.id,verification);
  };
  const evaluateCandidates=async(limit:number,fresh=new Set<string>())=>{
    const pending=report.stopReason==='profile_changed'?[]:(await store.pending(version,Math.min(30,limit*3),profile,[...descriptionBlocked])).sort((a,b)=>Number((b.assessment?.score??0)>=profile.minimumScore)-Number((a.assessment?.score??0)>=profile.minimumScore)||Number(matchesTitle(b.title,profile))-Number(matchesTitle(a.title,profile))||Number(fresh.has(b.id))-Number(fresh.has(a.id))).slice(0,Math.min(30,limit*3));
      let budgetStopped=false;
      const initial=counts.evaluated;
      for(const job of pending){
        if(counts.evaluated-initial>=limit)break;
        if(descriptionBlocked.has(job.sourceKey||'linkedin'))continue;
        if(!await current()){report.stopReason='profile_changed';break;}
        if(Date.now()>=session.deadline){report.stopReason='time_budget';break;}
        await store.heartbeat(id);
        try{
          if(!job.description){job.description=await dependencies.describe(job.id,job);await store.description(job.id,job.description);}
          if(job.description.length<50)throw new SourceError('A source returned too little description text to assess fit.');
        }catch(error){
          errors.push(error instanceof SourceError?error.message:'A job description could not be fetched. It will be retried next run.');
          if(error instanceof SourceError&&error.stop)descriptionBlocked.add(job.sourceKey||'linkedin');continue;
        }
        if(!await current()){report.stopReason='profile_changed';break;}
        try{
          const result=await dependencies.rank(job,profile,accountId,session.deadline);await store.assess(job.id,result.assessment,version);
          counts.evaluated++;counts.inputTokens+=result.inputTokens;counts.outputTokens+=result.outputTokens;evaluated.add(job.id);
        }catch(error){
          if(providerBalanceExhausted(error))aiUnavailable=true;
          errors.push(error instanceof AIBudgetError?error.message:'AI evaluation failed. Check model access, API balance, and credentials. The job is saved for retry.');
          budgetStopped=true;report.stopReason='evaluation_budget';break;
        }
      }
    return budgetStopped;
  };
  const metrics=(jobs:Awaited<ReturnType<Store['jobs']>>)=>{
    const strong=jobs.filter(j=>newCandidates.has(j.id)&&strongMatch(j,profile,version));
    report.metrics={elapsedMs:Math.max(0,Date.now()-started),uniqueDiscovered:seen.size,newCandidates:newCandidates.size,duplicateCandidates:jobs.filter(j=>seen.has(j.id)&&j.duplicateOf).length,evaluated:counts.evaluated,newStrongMatches:strong.length,newStrongWithOpenRoute:strong.filter(j=>j.verification?.status==='open').length,inputTokens:counts.inputTokens,outputTokens:counts.outputTokens};
  };
  try{
    if(profile.cvText.length<100)throw new Error('Add your CV in Search profile before running a search.');
    if(!integrations().ai)throw new Error('Add OPENAI_API_KEY on the server to enable matching.');
    if(backlogOnly){
      await evaluateCandidates(discoveryEvaluationLimit);
      if(report.stopReason==='round_limit')report.stopReason='evaluation_budget';
    }
    // Seedless company discovery must run before collection, not after LinkedIn
    // has spent the request budget. Only the opted-in source enables web tools.
    if(!backlogOnly&&profile.sources.includes('companies')&&!profile.companyBoards.length&&!state.boards.length&&dependencies.plan&&discoveryEvaluationLimit>0){
      try{
        plan=await dependencies.plan({profile,report,state,store,deadline:session.deadline,feedback:[]});counts.inputTokens+=plan.inputTokens;counts.outputTokens+=plan.outputTokens;
        if(plan.boards.length&&await current()){
          state={...state,boards:plan.boards};await store.saveDiscoveryState(scope,state,version);
          profile.discoveredCompanyBoards=state.boards.map(b=>b.url);
        }
      }catch(error){if(providerBalanceExhausted(error))aiUnavailable=true;errors.push(error instanceof AIBudgetError?error.message:'Company discovery was unavailable; other selected sources will still run.');}
    }
    for(let round=0;round<3&&!backlogOnly;round++){
      if(aiUnavailable){report.stopReason='evaluation_budget';break;}
      if(!await current()){report.stopReason='profile_changed';break;}
      if(Date.now()>=session.deadline){report.stopReason='time_budget';break;}
      if(discoveryEvaluationLimit===0){report.stopReason='evaluation_budget';break;}
      session.discoveryDeadline=Math.min(session.deadline-180000,Date.now()+90000);
      session.round=round;session.roundRemaining=Math.min(session.remaining,round===0?16:round===1?4:session.remaining);session.perSourceLimit=round===0?6:4;session.perSource.clear();session.attempts=[];session.items=[];
      let listings:JobListing[]=[];
      // Search-engine output contributes URLs only. Fetch actual public posting
      // evidence under the same request budget before any ranking can occur.
      for(const url of (plan?.jobUrls||[]).slice(0,2)){
        if(!await current()||Date.now()>=session.deadline)break;
        try{
          listings.push(...await searchQuery(session,{source:'web',url,query:`Public posting ${createHash('sha256').update(url).digest('hex').slice(0,24)}`,location:'',page:0},async()=>[await loadPublicJob(url,session.discoveryDeadline)]));
        }catch(error){errors.push(error instanceof SourceError?error.message:'A discovered public job could not be read. It was not imported.');}
      }
      try{
        const result=await dependencies.search(searchProfile,session);
        listings.push(...(Array.isArray(result)?result:result.jobs));
        if(Array.isArray(result))hadSuccess=true;
        else{errors.push(...result.errors);result.blocked.forEach(key=>session.blocked.add(key));hadSuccess ||= result.succeeded>0;}
        hadSuccess ||= session.attempts.some(a=>a.status==='ok');
      }catch(error){
        errors.push(error instanceof SourceError?error.message:'Job sources could not be reached. Check connectivity and run again later.');
        if(error instanceof SourceError&&error.stop)throw error;
      }
      // Later verification may still use source recovery under the full run budget.
      session.discoveryDeadline=undefined;
      const fresh=new Set<string>();
      for(const listing of listings.filter(listing=>listingWithinAge(listing,profile))){
        if(Date.now()>=session.deadline){report.stopReason='time_budget';break;}
        await store.upsert(listing);seen.add(listing.id);
        if(!known.has(listing.id)){known.add(listing.id);const saved=await store.job(listing.id);if(saved&&!saved.duplicateOf){fresh.add(listing.id);newCandidates.add(listing.id);}}
      }
      counts.discovered=seen.size;
      if(!await current())report.stopReason='profile_changed';
      // Reserve evaluation capacity for follow-up discoveries rather than judging
      // every first-page result before the agent has a chance to adapt.
      const allowance=round===2||session.remaining<=0||(!session.attempts.length&&!dependencies.plan)?discoveryEvaluationLimit-counts.evaluated:Math.ceil((discoveryEvaluationLimit-counts.evaluated)/(3-round));
      const budgetStopped=await evaluateCandidates(allowance,fresh);
      // Check fresh strong candidates before deciding that discovery has found
      // enough. A closed listing must not stop the loop as a successful match.
      if(dependencies.verify&&await current()){
        const candidates=(await store.jobs()).filter(j=>newCandidates.has(j.id)&&strongMatch(j,profile,version)&&!verified.has(j.id)&&needsVerification(j)).slice(0,verificationLimit-verified.size);
        for(const job of candidates){if(Date.now()>=session.deadline)break;await verify(job);verified.add(job.id);}
      }
      if(Date.now()>=session.deadline)report.stopReason='time_budget';
      if(!await current())report.stopReason='profile_changed';
      const jobs=await store.jobs();counts.matched=jobs.filter(j=>evaluated.has(j.id)&&strongMatch(j,profile,version)).length;
      metrics(jobs);
      const strong=jobs.filter(j=>newCandidates.has(j.id)&&strongMatch(j,profile,version)).length;
      report.rounds.push({round,reason:plan?.reason||'Search confirmed roles and selected sources.',newCandidates:fresh.size,strongCandidates:strong,attempts:session.attempts,generationId:plan?.generationId||null,queries:searchTitles(searchProfile),boards:plan?.boards.map(b=>b.url)||[]});
      report.coverage=locationCoverage(searchTargets(profile).map(t=>targetLabel(t)),report.rounds.flatMap(r=>r.attempts).map(attempt=>({...attempt,location:targetLabel(attempt)})));
      report.requests=24-session.remaining;
      const history=new Map(state.attempts.map(a=>[queryKey(a),a]));session.attempts.forEach(a=>history.set(queryKey(a),a));
      state={...state,attempts:[...history.values()].sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)).slice(-120)};
      state.attempts.forEach(a=>{const key=queryKey(a);session.history.set(key,a.checkedAt);if(a.status==='ok'&&a.scope?.status!=='mismatch')session.successful!.add(key);else session.successful!.delete(key);});
      if(!await store.saveDiscoveryState(scope,state,version)){report.stopReason='profile_changed';break;}
      await store.progress(id,counts,report);
      if(report.stopReason==='profile_changed'||report.stopReason==='time_budget'||budgetStopped)break;
      if(strong>=2){report.stopReason='sufficient_matches';break;}
      if(counts.evaluated>=discoveryEvaluationLimit){report.stopReason='evaluation_budget';break;}
      if(session.remaining<=0){report.stopReason='request_budget';break;}
      if(round===2)break;
      if(Date.now()>=session.deadline-180000){report.stopReason='discovery_time_budget';break;}
      const sources=[...profile.sources.filter(s=>s!=='companies'),...[...profile.companyBoards,...state.boards.map(b=>b.url)].map(v=>parseBoard(v)!.key),...activeCountrySources(profile).map(s=>s.key)];
      if(!sources.some(s=>!session.blocked.has(s))&&!profile.sources.includes('companies')){report.stopReason='sources_unavailable';break;}
      // Legacy injected search functions cannot report coverage; never extrapolate
      // or trigger paid planning from an unobservable source implementation.
      if(!session.attempts.length&&!dependencies.plan){report.stopReason='no_untried_queries';break;}
      plan=null;
      if(dependencies.plan){
        try{plan=await dependencies.plan({profile,report,state,store,deadline:session.deadline,feedback:jobs.filter(j=>evaluated.has(j.id)&&j.assessment).slice(-8).map(j=>({title:j.title,score:j.assessment!.score,eligibility:j.assessment!.eligibility,concerns:j.assessment!.concerns.map(v=>v.slice(0,300)).slice(0,4),decision:recommendation(j)}))});counts.inputTokens+=plan.inputTokens;counts.outputTokens+=plan.outputTokens;}
        catch(error){
          if(providerBalanceExhausted(error))aiUnavailable=true;
          if(error instanceof AIBudgetError){errors.push(error.message);report.stopReason='evaluation_budget';break;}
          if(aiUnavailable){errors.push('AI evaluation failed. Check model access, API balance, and credentials. The job is saved for retry.');report.stopReason='evaluation_budget';break;}
          errors.push('Adaptive planning was unavailable. Approved search pages were used where possible.');
        }
      }
      if(!await current()){report.stopReason='profile_changed';break;}
      if(plan?.boards.length){
        state={...state,boards:[...state.boards,...plan.boards].slice(0,20)};
        if(!await store.saveDiscoveryState(scope,state,version)){report.stopReason='profile_changed';break;}
        profile.discoveredCompanyBoards=state.boards.map(b=>b.url);
      }
      if(plan&&(plan.queries.length||plan.boards.length||plan.jobUrls?.length)){
        session.page=0;searchProfile={...profile,titles:plan.queries.length?plan.queries:profile.titles,strategy:{...profile.strategy,discovery:profile.strategy.discovery?{...profile.strategy.discovery,titleVariants:[]}:null}};
      }else{
        const page=fallbackPage(profile,state,report);
        if(page===null){report.stopReason=dependencies.plan&&!plan?'planner_unavailable':'no_untried_queries';break;}
        session.page=page;searchProfile=profile;
        plan={reason:'Few new strong matches: check an untried page of confirmed roles.',queries:[],boards:[],generationId:plan?.generationId||null,inputTokens:0,outputTokens:0};
      }
    }
    // A discovery stop does not exhaust the independent evaluation allowance.
    // Finish assessing collected candidates when no further collection can run.
    if(['discovery_time_budget','request_budget','no_untried_queries','sources_unavailable','planner_unavailable','round_limit'].includes(report.stopReason)&&counts.evaluated<discoveryEvaluationLimit&&Date.now()<session.deadline&&await current()){
      await evaluateCandidates(discoveryEvaluationLimit-counts.evaluated);
    }
    if(!backlogOnly&&dependencies.investigate&&profile.researchEnabled&&!aiUnavailable&&generationBudget>0&&await current()){
      const tasks=new ResearchTasks(store),eligible=(await store.jobs()).filter(j=>!descriptionBlocked.has(j.sourceKey||'linkedin')&&dueForInvestigation(j,profile,version)).sort((a,b)=>Number(Boolean(b.researchRequested))-Number(Boolean(a.researchRequested))||Number(promisingResearch(b,profile,version))-Number(promisingResearch(a,profile,version))||(b.assessment?.score||0)-(a.assessment?.score||0));
      const readiness=await Promise.all(eligible.map(j=>tasks.ready(j,version)));const candidates=eligible.filter((_,i)=>readiness[i]).slice(0,4);if(eligible.filter((_,i)=>readiness[i]).length>4)research.stopReason='opportunity_limit';
      for(const job of candidates){
        if(await remainingGenerations(store.userId,profile.dailyEvaluationLimit,new Accounts(store.db))===0){research.stopReason='daily_budget';break;}
        if(Date.now()>=session.deadline){research.stopReason='time_budget';break;}if(!await current())break;
        try{const result=await dependencies.investigate(store,job.id,{deadline:session.deadline});counts.inputTokens+=result.inputTokens;counts.outputTokens+=result.outputTokens;
          if(result.status==='unavailable'){research.stopReason='unavailable';break;}if(result.status==='deferred'||result.status==='profile_changed')continue;
          research.attempted++;research.resumed+=Number(Boolean(result.resumed));research.completed+=Number(result.status==='completed');research.verifiedEvidence+=result.verifiedEvidence;research.answered+=result.answered;research.unresolved+=result.unresolved;research.retryScheduled+=Number(result.status==='retry'&&!result.failed);research.failed+=Number(Boolean(result.failed));
        }catch(error){const balance=providerBalanceExhausted(error);research.attempted++;research.failed++;errors.push(error instanceof AIBudgetError?error.message:'Investigation could not finish. Saved evidence remains available; unresolved questions will be retried.');if(balance)aiUnavailable=true;if(error instanceof AIBudgetError||balance){research.stopReason=balance?'unavailable':'daily_budget';break;}}
        await store.researchProgress(id,research);
      }
    }
    // Research is not the final verdict. Reassess the exact vacancy using its
    // checked role excerpts; company facts cannot establish role conditions.
    if(!backlogOnly&&profile.researchEnabled&&!aiUnavailable&&generationBudget>0&&await current())for(const job of (await store.jobs()).filter(needsResearchReview)){
      if(Date.now()>=session.deadline)break;
      if(!await current())break;
      try{
        const generationId=job.research!.generationIds.at(-1)!;
        if(!checkedRoleEvidence(job,job.research).length){
          await store.assess(job.id,{...job.assessment!,researchGenerationId:generationId,researchReviewed:true},version);
          continue;
        }
        if(counts.evaluated>=evaluationLimit)break;
        const result=await dependencies.rank(job,profile,accountId,session.deadline,job.research);
        if(!await current())break;
        result.assessment.researchGenerationId=generationId;
        result.assessment.researchReviewed=true;
        await store.assess(job.id,result.assessment,version);
        counts.evaluated++;counts.inputTokens+=result.inputTokens;counts.outputTokens+=result.outputTokens;evaluated.add(job.id);
      }catch(error){errors.push(error instanceof AIBudgetError?error.message:'Research-based classification could not finish; it will be retried on the next search.');if(error instanceof AIBudgetError)break;}
    }
    if(dependencies.verify&&await current()){
      const unverified=(await store.jobs()).filter(j=>strongMatch(j,profile,version)&&!verified.has(j.id)&&needsVerification(j)).slice(0,verificationLimit-verified.size);
      for(const job of unverified){if(Date.now()>=session.deadline)break;await verify(job);verified.add(job.id);}
    }
    if(research.retryScheduled||research.failed)errors.push('Some research remains unfinished. Check investigation coverage and outcomes in Activity for retry and failure counts.');
    const finalJobs=await store.jobs();counts.matched=finalJobs.filter(j=>evaluated.has(j.id)&&strongMatch(j,profile,version)).length;metrics(finalJobs);
    const latest=await store.profile();
    if(latest.version===version&&canNotify){try{await dependencies.notify(store,latest.profile,version);}catch(error){errors.push(error instanceof Error?error.message:'Notification failed.');}}
    failed=!hadSuccess&&errors.length>0;
  }catch(error){failed=true;errors.push(error instanceof Error?error.message:'Search failed.');}
  finally{
    try{
      await store.researchProgress(id,research);report.requests=24-session.remaining;
      if(!report.metrics)metrics(await store.jobs());
      report.metrics!.elapsedMs=Math.max(0,Date.now()-started);await store.progress(id,counts,report);
    }catch{failed=true;errors.push('Final search progress could not be recorded.');}
    try{await store.cleanupJobs(version);}
    catch{failed=true;errors.push('Search cleanup could not finish. Existing records were preserved; the next search will retry.');}
    finally{
      clearInterval(heartbeat);
      await store.finish(id,failed?'failed':errors.length?'partial':'completed',counts,[...new Set(errors)].join(' ').slice(0,1500)||null);
    }
  }
  return {id,status:failed?'failed':errors.length?'partial':'completed',...counts};
}
