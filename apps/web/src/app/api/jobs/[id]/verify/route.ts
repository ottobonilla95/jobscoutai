import {localizedJson} from '@/lib/language';
import { guard, currentAccount, withUserStore } from '@/lib/auth';
import { getAccounts } from '@core/accounts';
import { verifyListing } from '@core/verification';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const denied=await guard(request);if(denied)return denied;const account=(await currentAccount())!;
 if(!getAccounts().allow(`verify:${account.id}`,5,300000))return localizedJson({error:'Please wait a few minutes before checking more links.'},{status:429});
 const {id}=await context.params;
 return withUserStore(async store=>{const job=store.job(id);if(!job)return localizedJson({error:'Job not found.'},{status:404});const verification=await verifyListing(job.url);store.verify(id,verification);return localizedJson({verification});});
}
