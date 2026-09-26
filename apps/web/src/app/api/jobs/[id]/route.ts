import {localizedJson} from '@/lib/language';
import { guard, limitedBody, withUserStore } from '@/lib/auth';
import { trackingSchema } from '@core/profile';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
 const denied=await guard(request);if(denied)return denied;
 const {id}=await context.params;
 try{const input=JSON.parse(new TextDecoder().decode(await limitedBody(request,20000)));
  return await withUserStore(store=>{
   const job=store.job(id);if(!job)return localizedJson({error:'Job not found.'},{status:404});
   if(input.distinct===true)store.db.prepare('UPDATE jobs SET duplicate_of=NULL,duplicate_reviewed=1 WHERE id=?').run(id);
   else if(input.tracking){store.track(id,trackingSchema.parse(input.tracking));}
   else if(['new','saved','dismissed'].includes(input.status))store.db.prepare('UPDATE jobs SET status=? WHERE id=?').run(input.status,id);
   else return localizedJson({error:'Invalid update.'},{status:400});
   return localizedJson({ok:true});
  });
 }catch{return localizedJson({error:'Check the tracking fields and try again.'},{status:400});}
}
