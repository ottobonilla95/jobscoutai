import type {JobListing} from './profile';
import {SourceError} from './source-error';
import {retrySource} from './source-retry';
import type {SearchScope} from './adaptive-search-schema';

export type SearchQuery={source:string;query:string;location:string;page:number};
export type SearchAttempt=SearchQuery&{status:'ok'|'blocked';found:number;checkedAt:string;retries?:number;error?:string;scope?:SearchScope};
export function queryKey(q:SearchQuery){return JSON.stringify([q.source,q.query.toLowerCase(),q.location.toLowerCase(),q.page]);}
export type SearchSession={
 round:number;page:number;remaining:number;deadline:number;seen:Set<string>;blocked:Set<string>;
 history:Map<string,string>;cache:Map<string,JobListing[]>;perSource:Map<string,number>;
 attempts:SearchAttempt[];items:JobListing[];perSourceLimit?:number;successful?:Set<string>;
};
export function orderedQueries<T extends SearchQuery>(queries:T[],session?:SearchSession):T[]{
 return session?[...queries].sort((a,b)=>(session.history.get(queryKey(a))||'').localeCompare(session.history.get(queryKey(b))||'')):queries;
}
/** Retry a query before recording its outcome; only access restrictions stop its source. */
export async function searchQuery(session:SearchSession|undefined,q:SearchQuery,read:()=>Promise<JobListing[]|{jobs:JobListing[];scope:SearchScope}>):Promise<JobListing[]>{
 if(!session){const result=await retrySource(read);return Array.isArray(result)?result:result.scope.status==='mismatch'?[]:result.jobs;}
 const key=queryKey(q);
 if(session.blocked.has(q.source))return [];
 if(session.cache.has(key))return session.cache.get(key)!;
 const hasBudget=()=>session.remaining>0&&(session.perSource.get(q.source)||0)<(session.perSourceLimit??6);
 if(session.seen.has(key)||!hasBudget()||Date.now()>=session.deadline)return [];
 // Follow-up queries rotate across runs rather than retrying the same page daily.
 if(session.round>0&&(session.successful?session.successful.has(key):session.history.has(key)))return [];
 session.seen.add(key);let retries=0;
 try{
  const result=await retrySource(async()=>{session.remaining--;session.perSource.set(q.source,(session.perSource.get(q.source)||0)+1);return read();},{deadline:session.deadline,canRetry:hasBudget,onRetry:count=>{retries=count;}});
  const items=Array.isArray(result)?result:result.jobs;
  const scope:SearchScope=Array.isArray(result)?{status:'unconfirmed',observedLocation:null,evidence:null,resultLocations:[...new Set(items.map(j=>j.location).filter(Boolean))].slice(0,20).map(v=>v.slice(0,240))}:result.scope;
  const accepted=scope.status==='mismatch'?[]:items;
  session.cache.set(key,accepted);session.items.push(...accepted);
  session.attempts.push({...q,status:'ok',found:items.length,checkedAt:new Date().toISOString(),retries,scope});return accepted;
 }catch(error){
  session.attempts.push({...q,status:'blocked',found:0,checkedAt:new Date().toISOString(),retries,error:error instanceof SourceError?error.message.slice(0,500):'Source request failed. Coverage is unknown.'});
  if(error instanceof SourceError&&error.stop)session.blocked.add(q.source);
  throw error;
 }
}

export function locationCoverage(locations:string[],attempts:SearchAttempt[]){
 const requested=[...new Set(locations.filter(Boolean))];
 const checked=requested.filter(location=>attempts.some(a=>a.location===location&&a.status==='ok'&&a.scope?.status!=='mismatch'));
 const mismatched=requested.filter(location=>!checked.includes(location)&&attempts.some(a=>a.location===location&&a.scope?.status==='mismatch'));
 const unconfirmed=checked.filter(location=>!attempts.some(a=>a.location===location&&a.status==='ok'&&a.scope?.status==='confirmed'));
 const unavailable=requested.filter(location=>!checked.includes(location)&&attempts.some(a=>a.location===location&&a.status==='blocked'));
 return {checked,unavailable,unsearched:requested.filter(location=>!checked.includes(location)&&!unavailable.includes(location)&&!mismatched.includes(location)),unconfirmed,mismatched};
}
