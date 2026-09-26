import { getAccounts, type Accounts } from './accounts';
import { runSearch } from './worker';
// One account per invocation, least-recently checked first. A global lease prevents
// simultaneous portal scans across processes; each account also has its own run lease.
export async function runScheduled({accounts=getAccounts(),forceUserId,run=runSearch}:{accounts?:Accounts;forceUserId?:string;run?:typeof runSearch}={}){
 const owner=(await accounts.claimScheduler());if(!owner)return {status:'idle'};
 const heartbeat=setInterval(()=>{void accounts.renewScheduler(owner).catch(()=>console.error('Scheduler lease renewal failed.'));},30000);
 try{
  const users=forceUserId?[(await accounts.byId(forceUserId))].filter(x=>x!==null):(await accounts.list());
  if(forceUserId&&!users.length)throw new Error('Account not found.');
  for(const user of users){
   (await accounts.db.prepare('UPDATE accounts SET last_check=? WHERE id=?').run(Date.now(),user.id));
   const store=(await accounts.store(user.id));
   try{
    (await store.heartbeat());const {profile}=(await store.profile());const state=(await store.state());
    if(!forceUserId&&!state.requested&&!(profile.enabled&&(!state.next_run||Date.parse(String(state.next_run))<=Date.now())))continue;
    const result=await run({store,accountId:user.id,canNotify:(await accounts.verified(user.id))&&profile.email.toLowerCase()===user.email,force:Boolean(forceUserId)});
    if(result.status!=='idle')return {accountId:user.id,...result};
   }finally{/* Store shares the process connection pool. */}
  }
  return {status:'idle'};
 }finally{clearInterval(heartbeat);(await accounts.releaseScheduler(owner));}
}
