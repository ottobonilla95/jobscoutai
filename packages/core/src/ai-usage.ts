import {randomUUID} from 'node:crypto';
import {integrations} from './config';
import {getAccounts, type Accounts} from './accounts';
export class AIBudgetError extends Error {}
export async function beginGeneration(accountId:string,kind:'ranking'|'strategy',dailyLimit:number,accounts:Accounts=getAccounts()){
 const id=randomUUID();const day=new Date().toISOString().slice(0,10);
 const configured=Number(process.env.AI_DAILY_CALL_LIMIT||500);const globalLimit=Number.isFinite(configured)&&configured>0?Math.floor(configured):500;
 return accounts.db.transaction(async db=>{
  await db.exec('SELECT pg_advisory_xact_lock(1936028277)');
  const global=Number((await db.prepare('SELECT count(*) AS n FROM ai_generations WHERE created_at>=?').get(day)).n);
  const user=Number((await db.prepare('SELECT count(*) AS n FROM ai_generations WHERE user_id=? AND created_at>=?').get(accountId,day)).n);
  if(global>=globalLimit||user>=dailyLimit)throw new AIBudgetError('Daily AI call budget reached. Try again after midnight UTC.');
  await db.prepare('INSERT INTO ai_generations(id,user_id,kind,model,created_at,status) VALUES(?,?,?,?,?,?)').run(id,accountId,kind,integrations().model,new Date().toISOString(),'pending');return id;
 });
}
export async function finishGeneration(id:string,status:'completed'|'failed',inputTokens=0,outputTokens=0,accounts:Accounts=getAccounts()){await accounts.db.prepare('UPDATE ai_generations SET status=?,input_tokens=?,output_tokens=?,finished_at=? WHERE id=?').run(status,inputTokens,outputTokens,new Date().toISOString(),id);}
