import {localizedJson} from '@/lib/language';import {guard,currentAccount,limitedBody,withUserStore} from '@/lib/auth';
import {getAccounts} from '@core/accounts';import {recordFeedback,reviewFeedback,FeedbackConflict} from '@core/feedback';
async function action(request:Request,context:{params:Promise<{id:string}>},review:boolean){
 const denied=await guard(request);if(denied)return denied;const account=(await currentAccount())!;
 if(!await getAccounts().allow(`feedback:${account.id}`,20,300000))return localizedJson({error:'Please wait a few minutes before saving more feedback.'},{status:429});
 const {id}=await context.params;
 try{const input=JSON.parse(new TextDecoder().decode(await limitedBody(request,4000)));return await withUserStore(async store=>localizedJson({feedback:await (review?reviewFeedback:recordFeedback)(store,id,input)}));}
 catch(e){return localizedJson({error:e instanceof FeedbackConflict?e.message:'Check the feedback fields and try again.'},{status:e instanceof FeedbackConflict?409:400});}
}
export function POST(request:Request,context:{params:Promise<{id:string}>}){return action(request,context,false);}
export function PATCH(request:Request,context:{params:Promise<{id:string}>}){return action(request,context,true);}
