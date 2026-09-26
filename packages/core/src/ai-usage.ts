import {randomUUID} from 'node:crypto';
import {getAccounts} from './accounts';
export class AIBudgetError extends Error {}
export function beginGeneration(accountId:string,kind:'ranking'|'strategy',dailyLimit:number){
 const accounts=getAccounts();const id=randomUUID();const day=new Date().toISOString().slice(0,10);
 const configured=Number(process.env.AI_DAILY_CALL_LIMIT||500);const globalLimit=Number.isFinite(configured)&&configured>0?Math.floor(configured):500;
 accounts.db.exec('BEGIN IMMEDIATE');
 try{
  const global=Number(accounts.db.prepare('SELECT count(*) AS n FROM ai_generations WHERE created_at>=?').get(day)!.n);
  const user=Number(accounts.db.prepare('SELECT count(*) AS n FROM ai_generations WHERE user_id=? AND created_at>=?').get(accountId,day)!.n);
  if(global>=globalLimit||user>=dailyLimit)throw new AIBudgetError('Daily AI call budget reached. Try again after midnight UTC.');
  accounts.db.prepare('INSERT INTO ai_generations(id,user_id,kind,model,created_at,status) VALUES(?,?,?,?,?,?)').run(id,accountId,kind,process.env.AI_MODEL||'openai/gpt-6-luna',new Date().toISOString(),'pending');accounts.db.exec('COMMIT');return id;
 }catch(e){accounts.db.exec('ROLLBACK');throw e;}
}
export function finishGeneration(id:string,status:'completed'|'failed',inputTokens=0,outputTokens=0){getAccounts().db.prepare('UPDATE ai_generations SET status=?,input_tokens=?,output_tokens=?,finished_at=? WHERE id=?').run(status,inputTokens,outputTokens,new Date().toISOString(),id);}
