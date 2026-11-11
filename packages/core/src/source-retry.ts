import {SourceError} from './source-error';

type RetryOptions={deadline?:number;canRetry?:()=>boolean;onRetry?:(count:number)=>void;sleep?:(ms:number)=>Promise<void>;now?:()=>number};
/** Three attempts with backoff, bounded by the caller's request/time budgets. */
export async function retrySource<T>(read:()=>Promise<T>,options:RetryOptions={}):Promise<T>{
 const now=options.now??Date.now,sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const deadline=options.deadline??now()+60000;
 for(let attempt=0;;attempt++){
  try{return await read();}
  catch(error){
   if(attempt>=2||(error instanceof SourceError&&!error.retryable))throw error;
   const delay=Math.max(2000*2**attempt,error instanceof SourceError?error.retryAfterMs||0:0);
   if(now()+delay>=deadline||options.canRetry?.()===false)throw error;
   await sleep(delay);
   if(now()>=deadline||options.canRetry?.()===false)throw error;
   options.onRetry?.(attempt+1);
  }
 }
}
