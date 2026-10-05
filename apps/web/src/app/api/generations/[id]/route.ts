import {currentAccount,guard} from '@/lib/auth';
import {generationForAccount} from '@core/ai-usage';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const denied=await guard();if(denied)return denied;
 const account=(await currentAccount())!;
 const generation=await generationForAccount((await params).id,account.id);
 return Response.json(generation||{error:'Not found.'},{status:generation?200:404,headers:{'Cache-Control':'private, no-store'}});
}
