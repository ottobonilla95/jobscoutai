import type {JobListing} from './profile';
import {SourceError} from './linkedin';

export type SearchQuery={source:string;query:string;location:string;page:number};
export type SearchAttempt=SearchQuery&{status:'ok'|'blocked';found:number;checkedAt:string};
export function queryKey(q:SearchQuery){return JSON.stringify([q.source,q.query.toLowerCase(),q.location.toLowerCase(),q.page]);}
export type SearchSession={
 round:number;page:number;remaining:number;deadline:number;seen:Set<string>;blocked:Set<string>;
 history:Map<string,string>;cache:Map<string,JobListing[]>;perSource:Map<string,number>;
 attempts:SearchAttempt[];items:JobListing[];
};
export function orderedQueries<T extends SearchQuery>(queries:T[],session?:SearchSession):T[]{
 return session?[...queries].sort((a,b)=>(session.history.get(queryKey(a))||'').localeCompare(session.history.get(queryKey(b))||'')):queries;
}
/** One logical source query; access failures stop that source for the whole run. */
export async function searchQuery(session:SearchSession|undefined,q:SearchQuery,read:()=>Promise<JobListing[]>):Promise<JobListing[]>{
 if(!session)return read();
 const key=queryKey(q);
 if(session.blocked.has(q.source))return [];
 if(session.cache.has(key))return session.cache.get(key)!;
 if(session.seen.has(key)||session.remaining<=0||Date.now()>=session.deadline||(session.perSource.get(q.source)||0)>=6)return [];
 // Follow-up queries rotate across runs rather than retrying the same page daily.
 if(session.round>0&&session.history.has(key))return [];
 session.seen.add(key);session.remaining--;session.perSource.set(q.source,(session.perSource.get(q.source)||0)+1);
 try{
  const items=await read();session.cache.set(key,items);session.items.push(...items);
  session.attempts.push({...q,status:'ok',found:items.length,checkedAt:new Date().toISOString()});return items;
 }catch(error){
  session.attempts.push({...q,status:'blocked',found:0,checkedAt:new Date().toISOString()});
  if(error instanceof SourceError&&error.stop)session.blocked.add(q.source);
  throw error;
 }
}
