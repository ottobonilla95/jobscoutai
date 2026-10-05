import {localizedJson} from '@/lib/language';
import {guard,currentAccount,withUserStore} from '@/lib/auth';
import {getAccounts} from '@core/accounts';
import {integrations} from '@core/config';
import {sourceEnabled} from '@core/source-settings';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 const denied=await guard(request);if(denied)return denied;const account=(await currentAccount())!;
 if(!await getAccounts().allow(`research:${account.id}`,5,300000))return localizedJson({error:'Please wait a few minutes before requesting more research.'},{status:429});
 const {id}=await context.params;
 return withUserStore(async store=>{
  const job=await store.job(id);if(!job)return localizedJson({error:'Job not found.'},{status:404});
  const {profile}=await store.profile();
  if(!profile.researchEnabled||!integrations().research)return localizedJson({error:'Enable goal research and configure web research access before requesting an investigation.'},{status:409});
  if(job.status==='dismissed'||job.duplicateOf||job.verification?.status==='closed'||job.assessment?.eligibility==='ineligible'||!sourceEnabled(profile,job.sourceKey))return localizedJson({error:'This opportunity is not eligible for research. Review its status and selected source.'},{status:409});
  await store.requestResearch(id);
  return localizedJson({message:'Research queued for the next eligible worker run. Your search cadence and AI call budget still apply.'});
 });
}
