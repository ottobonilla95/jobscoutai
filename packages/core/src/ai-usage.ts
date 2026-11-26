import {randomUUID} from 'node:crypto';
import {integrations} from './config';
import {getAccounts, type Accounts} from './accounts';
export class AIBudgetError extends Error {}
function globalGenerationLimit(){const configured=Number(process.env.AI_DAILY_CALL_LIMIT||500);return Number.isFinite(configured)&&configured>0?Math.floor(configured):500;}
export async function remainingGenerations(accountId:string,dailyLimit:number,accounts:Accounts=getAccounts()){
 const day=new Date().toISOString().slice(0,10);
 const global=Number((await accounts.db.prepare('SELECT count(*) AS n FROM ai_generations WHERE created_at>=?').get(day)).n);
 const user=Number((await accounts.db.prepare('SELECT count(*) AS n FROM ai_generations WHERE user_id=? AND created_at>=?').get(accountId,day)).n);
 return Math.max(0,Math.min(globalGenerationLimit()-global,dailyLimit-user));
}
export function providerBalanceExhausted(error:unknown){
 const value=error as {message?:unknown;responseBody?:unknown;data?:{error?:{code?:unknown}}}|null;
 return [value?.message,value?.responseBody,value?.data?.error?.code].some(part=>typeof part==='string'&&/credit_balance_exhausted|insufficient_quota|billing_hard_limit_reached/.test(part));
}
export async function beginGeneration(accountId:string,kind:'ranking'|'strategy'|'research',dailyLimit:number,accounts:Accounts=getAccounts()){
 const id=randomUUID();const day=new Date().toISOString().slice(0,10);
 const globalLimit=globalGenerationLimit();
 return accounts.db.transaction(async db=>{
  await db.exec('SELECT pg_advisory_xact_lock(1936028277)');
  const global=Number((await db.prepare('SELECT count(*) AS n FROM ai_generations WHERE created_at>=?').get(day)).n);
  const user=Number((await db.prepare('SELECT count(*) AS n FROM ai_generations WHERE user_id=? AND created_at>=?').get(accountId,day)).n);
  if(global>=globalLimit||user>=dailyLimit)throw new AIBudgetError('Daily AI call budget reached. Try again after midnight UTC.');
  await db.prepare('INSERT INTO ai_generations(id,user_id,kind,model,created_at,status) VALUES(?,?,?,?,?,?)').run(id,accountId,kind,integrations().model,new Date().toISOString(),'pending');return id;
 });
}
export async function finishGeneration(id:string,status:'completed'|'failed',inputTokens=0,outputTokens=0,accounts:Accounts=getAccounts(),result?:unknown){await accounts.db.prepare('UPDATE ai_generations SET status=?,input_tokens=?,output_tokens=?,finished_at=?,result=COALESCE(?,result) WHERE id=?').run(status,inputTokens,outputTokens,new Date().toISOString(),result===undefined?null:JSON.stringify(result),id);}
export async function generationForAccount(id:string,accountId:string,accounts:Accounts=getAccounts()){
 const row=await accounts.db.prepare('SELECT id,kind,model,created_at,finished_at,status,input_tokens,output_tokens,result FROM ai_generations WHERE id=? AND user_id=?').get(id,accountId);
 return row?{id:String(row.id),kind:String(row.kind),model:String(row.model),createdAt:String(row.created_at),finishedAt:row.finished_at?String(row.finished_at):null,status:String(row.status),inputTokens:Number(row.input_tokens),outputTokens:Number(row.output_tokens),result:row.result?JSON.parse(row.result):null}:null;
}
