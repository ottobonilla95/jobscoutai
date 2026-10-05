import {z} from 'zod';import {localizedJson} from '@/lib/language';import {guard,limitedBody,withUserStore} from '@/lib/auth';import {removePreference,FeedbackConflict} from '@core/feedback';
export async function DELETE(request:Request){const denied=await guard(request);if(denied)return denied;
 try{const input=z.object({id:z.uuid(),version:z.number().int().positive()}).parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,1000))));return await withUserStore(async store=>{await removePreference(store,input.id,input.version);return localizedJson({ok:true});});}
 catch(e){return localizedJson({error:e instanceof FeedbackConflict?e.message:'Could not update preference.'},{status:e instanceof FeedbackConflict?409:400});}
}
