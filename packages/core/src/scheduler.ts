import { getAccounts, type Accounts } from './accounts';
import { runSearch } from './worker';
// One account per invocation, least-recently checked first. A global lease prevents
// simultaneous portal scans across processes; each account also has its own run lease.
export async function runScheduled({accounts=getAccounts(),forceUserId,run=runSearch}:{accounts?:Accounts;forceUserId?:string;run?:typeof runSearch}={}){
 const owner=accounts.claimScheduler();if(!owner)return {status:'idle'};
 const heartbeat=setInterval(()=>accounts.renewScheduler(owner),30000);
 try{
  const users=forceUserId?[accounts.byId(forceUserId)].filter(x=>x!==null):accounts.list();
  if(forceUserId&&!users.length)throw new Error('Account not found.');
  for(const user of users){
   accounts.db.prepare('UPDATE accounts SET last_check=? WHERE id=?').run(Date.now(),user.id);
   const store=accounts.store(user.id);
   try{
    store.heartbeat();const {profile}=store.profile();const state=store.state();
    if(!forceUserId&&!state.requested&&!(profile.enabled&&(!state.next_run||Date.parse(String(state.next_run))<=Date.now())))continue;
    const result=await run({store,accountId:user.id,canNotify:accounts.verified(user.id)&&profile.email.toLowerCase()===user.email,force:Boolean(forceUserId)});
    if(result.status!=='idle')return {accountId:user.id,...result};
   }finally{store.db.close();}
  }
  return {status:'idle'};
 }finally{clearInterval(heartbeat);accounts.releaseScheduler(owner);}
}
