import {guard,limitedBody,withUserStore} from '@/lib/auth';
import {localizedJson} from '@/lib/language';
import {CvStore,CvError} from '@core/cv-store';
import {cvDraftSchema} from '@core/cv';
import {z} from 'zod';

const mutation=z.object({
  action:z.enum(['save','delete','use']),id:z.uuid(),revision:z.number().int().positive(),
  draft:cvDraftSchema.optional(),
}).strict();
export async function GET(){
  const denied=await guard();if(denied)return denied;
  return Response.json({cvs:await withUserStore(store=>new CvStore(store.db,store.userId).list())});
}
export async function POST(request:Request){
  const denied=await guard(request);if(denied)return denied;
  try {
    const draft=cvDraftSchema.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request))));
    const cv=await withUserStore(store=>new CvStore(store.db,store.userId).create(draft));
    return Response.json({cv},{status:201});
  }catch(error){return localizedJson({error:error instanceof CvError?error.message:'Could not save your CV. Check the fields and try again.'},{status:error instanceof CvError?error.status:400});}
}
export async function PATCH(request:Request){
  const denied=await guard(request);if(denied)return denied;
  try {
    const value=mutation.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request))));
    return await withUserStore(async store=>{
      const cvs=new CvStore(store.db,store.userId);
      if(value.action==='delete'){await cvs.remove(value.id,value.revision);return Response.json({ok:true});}
      if(value.action==='use'){await cvs.useForMatching(value.id,value.revision);return Response.json({ok:true});}
      if(!value.draft)throw new Error('Missing CV draft.');
      return Response.json({cv:await cvs.update(value.id,value.revision,value.draft)});
    });
  }catch(error){return localizedJson({error:error instanceof CvError?error.message:'Could not save your CV. Check the fields and try again.'},{status:error instanceof CvError?error.status:400});}
}
