import { AIBudgetError } from './ai-usage';
import { integrations } from './config';
import { verifyListing } from './verification';
import { strongMatch,recommendation } from './recommendation';
import { SourceError } from './linkedin';
import { searchSources, describeJob, type SearchReport } from './sources';
import type { JobListing, Profile } from './profile';
import { rankJob } from './ranker';
import { notifyMatches } from './notifications';
import { type Store } from './store';
import {planAdaptiveSearch,fallbackPage,type AdaptivePlan,type PlannerInput} from './adaptive-planner';
import {discoveryScope,freshDiscoveryState} from './discovery-state';
import type {SearchDiscovery} from './adaptive-search-schema';
import {queryKey,type SearchSession} from './search-session';
import {searchTitles} from './discovery';
import {activeCountrySources} from './country-sources';
import {parseBoard} from './source-settings';

const defaults = { verify: verifyListing, search: (profile:Profile,session?:SearchSession)=>searchSources(profile,undefined,session), describe: describeJob, rank: rankJob, notify: notifyMatches,plan:planAdaptiveSearch };
type Dependencies={search:(profile:Profile,session?:SearchSession)=>Promise<SearchReport|JobListing[]>;describe:typeof describeJob;rank:typeof rankJob;notify:typeof notifyMatches;verify?:typeof verifyListing;plan?:(input:PlannerInput)=>Promise<AdaptivePlan>};
export async function runSearch({ store, force = false, accountId, canNotify = true, dependencies = defaults }: {
  store: Store; force?: boolean; canNotify?:boolean; accountId?:string; dependencies?:Dependencies;
}) {
  await store.heartbeat();
  const id=await store.claim(force);if(!id)return {status:'idle' as const};
  const started=Date.now();
  const {profile,version}=await store.profile();
  const scope=discoveryScope(profile);
  let state=freshDiscoveryState(await store.discoveryState(scope));
  const counts={discovered:0,evaluated:0,matched:0,inputTokens:0,outputTokens:0};
  const report:SearchDiscovery={profileVersion:version,rounds:[],requests:0,requestLimit:24,stopReason:'round_limit'};
  const session:SearchSession={round:0,page:0,remaining:24,deadline:started+8*60000,seen:new Set(),blocked:new Set(),history:new Map(state.attempts.map(a=>[queryKey(a),a.checkedAt])),cache:new Map(),perSource:new Map(),attempts:[],items:[]};
  const errors:string[]=[];let failed=false,hadSuccess=false;
  const known=new Set((await store.jobs()).map(j=>j.id)),seen=new Set<string>(),evaluated=new Set<string>(),newCandidates=new Set<string>(),verified=new Set<string>();
  const evaluationLimit=Math.max(0,Math.min(profile.maxJobsPerRun,profile.dailyEvaluationLimit-await store.evaluatedToday()));
  let searchProfile=profile,plan:AdaptivePlan|null=null;
  const heartbeat=setInterval(()=>{void store.heartbeat(id).catch(()=>console.error('Worker heartbeat failed.'));},30000);
  const current=async()=> (await store.profile()).version===version;
  try{
    if(profile.cvText.length<100)throw new Error('Add your CV in Search profile before running a search.');
    if(!integrations().ai)throw new Error('Add OPENAI_API_KEY on the server to enable matching.');
    for(let round=0;round<3;round++){
      if(!await current()){report.stopReason='profile_changed';break;}
      if(Date.now()>=session.deadline){report.stopReason='time_budget';break;}
      if(evaluationLimit===0){report.stopReason='evaluation_budget';break;}
      session.round=round;session.perSource.clear();session.attempts=[];session.items=[];
      let listings:JobListing[]=[];
      try{
        const result=await dependencies.search(searchProfile,session);
        listings=Array.isArray(result)?result:result.jobs;
        if(Array.isArray(result))hadSuccess=true;
        else{errors.push(...result.errors);result.blocked.forEach(key=>session.blocked.add(key));hadSuccess ||= result.succeeded>0;}
        hadSuccess ||= session.attempts.some(a=>a.status==='ok');
      }catch(error){
        errors.push(error instanceof SourceError?error.message:'Job sources could not be reached. Check connectivity and run again later.');
        if(error instanceof SourceError&&error.stop)throw error;
      }
      const fresh=new Set<string>();
      for(const listing of listings){
        if(Date.now()>=session.deadline){report.stopReason='time_budget';break;}
        await store.upsert(listing);seen.add(listing.id);
        if(!known.has(listing.id)){known.add(listing.id);const saved=await store.job(listing.id);if(saved&&!saved.duplicateOf){fresh.add(listing.id);newCandidates.add(listing.id);}}
      }
      counts.discovered=seen.size;
      if(!await current())report.stopReason='profile_changed';
      // Reserve evaluation capacity for follow-up discoveries rather than judging
      // every first-page result before the agent has a chance to adapt.
      const allowance=round===2||(!session.attempts.length&&!dependencies.plan)?evaluationLimit-counts.evaluated:Math.ceil((evaluationLimit-counts.evaluated)/(3-round));
      const pending=report.stopReason==='profile_changed'?[]:(await store.pending(version,evaluationLimit-counts.evaluated,profile,[...session.blocked])).sort((a,b)=>Number(fresh.has(b.id))-Number(fresh.has(a.id))).slice(0,allowance);
      let budgetStopped=false;
      for(const job of pending){
        if(session.blocked.has(job.sourceKey||'linkedin'))continue;
        if(!await current()){report.stopReason='profile_changed';break;}
        if(Date.now()>=session.deadline){report.stopReason='time_budget';break;}
        await store.heartbeat(id);
        try{
          if(!job.description){job.description=await dependencies.describe(job.id,job);await store.description(job.id,job.description);}
          if(job.description.length<50)throw new SourceError('A source returned too little description text to assess fit.');
        }catch(error){
          errors.push(error instanceof SourceError?error.message:'A job description could not be fetched. It will be retried next run.');
          if(error instanceof SourceError&&error.stop)session.blocked.add(job.sourceKey||'linkedin');continue;
        }
        if(!await current()){report.stopReason='profile_changed';break;}
        try{
          const result=await dependencies.rank(job,profile,accountId);await store.assess(job.id,result.assessment,version);
          counts.evaluated++;counts.inputTokens+=result.inputTokens;counts.outputTokens+=result.outputTokens;evaluated.add(job.id);
        }catch(error){
          errors.push(error instanceof AIBudgetError?error.message:'AI evaluation failed. Check model access, API balance, and credentials. The job is saved for retry.');
          budgetStopped=true;report.stopReason='evaluation_budget';break;
        }
      }
      // Check fresh strong candidates before deciding that discovery has found
      // enough. A closed listing must not stop the loop as a successful match.
      if(dependencies.verify&&await current()){
        const candidates=(await store.jobs()).filter(j=>newCandidates.has(j.id)&&strongMatch(j,profile,version)&&!verified.has(j.id)&&(!j.verification||Date.now()-Date.parse(j.verification.checkedAt)>14*86400000)).slice(0,3-verified.size);
        for(const job of candidates){if(Date.now()>=session.deadline)break;await store.verify(job.id,await dependencies.verify(job.url));verified.add(job.id);}
      }
      if(Date.now()>=session.deadline)report.stopReason='time_budget';
      if(!await current())report.stopReason='profile_changed';
      const jobs=await store.jobs();counts.matched=jobs.filter(j=>evaluated.has(j.id)&&strongMatch(j,profile,version)).length;
      const strong=jobs.filter(j=>newCandidates.has(j.id)&&strongMatch(j,profile,version)).length;
      report.rounds.push({round,reason:plan?.reason||'Search confirmed roles and selected sources.',newCandidates:fresh.size,strongCandidates:strong,attempts:session.attempts,generationId:plan?.generationId||null,queries:searchTitles(searchProfile),boards:plan?.boards.map(b=>b.url)||[]});
      report.requests=24-session.remaining;
      const history=new Map(state.attempts.map(a=>[queryKey(a),a]));session.attempts.forEach(a=>history.set(queryKey(a),a));
      state={...state,attempts:[...history.values()].sort((a,b)=>a.checkedAt.localeCompare(b.checkedAt)).slice(-120)};
      state.attempts.forEach(a=>session.history.set(queryKey(a),a.checkedAt));
      if(!await store.saveDiscoveryState(scope,state,version)){report.stopReason='profile_changed';break;}
      await store.progress(id,counts,report);
      if(report.stopReason==='profile_changed'||report.stopReason==='time_budget'||budgetStopped)break;
      if(strong>=2){report.stopReason='sufficient_matches';break;}
      if(counts.evaluated>=evaluationLimit){report.stopReason='evaluation_budget';break;}
      if(session.remaining<=0){report.stopReason='request_budget';break;}
      if(round===2)break;
      const sources=[...profile.sources.filter(s=>s!=='companies'),...[...profile.companyBoards,...state.boards.map(b=>b.url)].map(v=>parseBoard(v)!.key),...activeCountrySources(profile).map(s=>s.key)];
      if(!sources.some(s=>!session.blocked.has(s))&&!profile.sources.includes('companies')){report.stopReason='sources_unavailable';break;}
      // Legacy injected search functions cannot report coverage; never extrapolate
      // or trigger paid planning from an unobservable source implementation.
      if(!session.attempts.length&&!dependencies.plan){report.stopReason='no_untried_queries';break;}
      plan=null;
      if(dependencies.plan){
        try{plan=await dependencies.plan({profile,report,state,store,deadline:session.deadline,feedback:jobs.filter(j=>evaluated.has(j.id)&&j.assessment).slice(-8).map(j=>({title:j.title,score:j.assessment!.score,eligibility:j.assessment!.eligibility,concerns:j.assessment!.concerns.map(v=>v.slice(0,300)).slice(0,4),decision:recommendation(j)}))});counts.inputTokens+=plan.inputTokens;counts.outputTokens+=plan.outputTokens;}
        catch(error){
          if(error instanceof AIBudgetError){errors.push(error.message);report.stopReason='evaluation_budget';break;}
          errors.push('Adaptive planning was unavailable. Approved search pages were used where possible.');
        }
      }
      if(!await current()){report.stopReason='profile_changed';break;}
      if(plan?.boards.length){
        state={...state,boards:[...state.boards,...plan.boards].slice(0,20)};
        if(!await store.saveDiscoveryState(scope,state,version)){report.stopReason='profile_changed';break;}
        profile.discoveredCompanyBoards=state.boards.map(b=>b.url);
      }
      if(plan&&(plan.queries.length||plan.boards.length)){
        session.page=0;searchProfile={...profile,titles:plan.queries.length?plan.queries:profile.titles,strategy:{...profile.strategy,discovery:profile.strategy.discovery?{...profile.strategy.discovery,titleVariants:[]}:null}};
      }else{
        const page=fallbackPage(profile,state,report);
        if(page===null){report.stopReason=dependencies.plan&&!plan?'planner_unavailable':'no_untried_queries';break;}
        session.page=page;searchProfile=profile;
        plan={reason:'Few new strong matches: check an untried page of confirmed roles.',queries:[],boards:[],generationId:plan?.generationId||null,inputTokens:0,outputTokens:0};
      }
    }
    if(dependencies.verify&&await current()){
      const stale=(await store.jobs()).filter(j=>j.status!=='dismissed'&&!j.duplicateOf&&!verified.has(j.id)&&(!j.verification||Date.now()-Date.parse(j.verification.checkedAt)>14*86400000)).slice(0,3-verified.size);
      for(const job of stale){if(Date.now()>=session.deadline)break;await store.verify(job.id,await dependencies.verify(job.url));}
    }
    counts.matched=(await store.jobs()).filter(j=>evaluated.has(j.id)&&strongMatch(j,profile,version)).length;
    const latest=await store.profile();
    if(latest.version===version&&canNotify){try{await dependencies.notify(store,latest.profile,version);}catch(error){errors.push(error instanceof Error?error.message:'Notification failed.');}}
    failed=!hadSuccess&&errors.length>0;
  }catch(error){failed=true;errors.push(error instanceof Error?error.message:'Search failed.');}
  finally{
    clearInterval(heartbeat);report.requests=24-session.remaining;await store.progress(id,counts,report);
    await store.finish(id,failed?'failed':errors.length?'partial':'completed',counts,[...new Set(errors)].join(' ').slice(0,1500)||null);
  }
  return {id,status:failed?'failed':errors.length?'partial':'completed',...counts};
}
