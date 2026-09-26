import {localizedJson} from '@/lib/language';
import { guard, currentAccount, withUserStore } from '@/lib/auth';
import { getAccounts } from '@core/accounts';
import { integrations } from '@core/config';
export async function POST(request:Request){
 const denied=await guard(request);if(denied)return denied;
 return withUserStore(store=>{
  if(store.profile().profile.cvText.length<100)return localizedJson({error:'Add your CV in Search profile first.'},{status:400});
  if(!integrations().ai)return localizedJson({error:'AI matching is not connected yet. Your profile is saved; try again once the service is available.'},{status:503});
  return queue();
  async function queue(){
   const account=(await currentAccount())!;
   if(!getAccounts().allow(`manual-search:${account.id}`,1,5*60000))return localizedJson({error:'Please wait five minutes between manual searches.'},{status:429});
   store.requestRun();return localizedJson({ok:true,message:'Search queued. The worker will pick it up on its next check.'},{status:202});
  }
 });
}
