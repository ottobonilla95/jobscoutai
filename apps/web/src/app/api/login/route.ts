import {localizedJson} from '@/lib/language';
import { sameOrigin, limitedBody, setSession } from '@/lib/auth';
import { getAccounts, credentialsSchema } from '@core/accounts';
export async function POST(request:Request){
 if(!sameOrigin(request))return localizedJson({error:'Request origin is not allowed.'},{status:403});
 const accounts=getAccounts();
 if(!accounts.allow('login:global',100,15*60000))return localizedJson({error:'Too many attempts. Please try again later.'},{status:429});
 try{
  const parsed=credentialsSchema.safeParse(JSON.parse(new TextDecoder().decode(await limitedBody(request,4000))));
  if(!parsed.success)return localizedJson({error:'Email or password is incorrect.'},{status:401});
  const {email,password}=parsed.data;
  if(!accounts.allow(`login:${email}`,10,15*60000))return localizedJson({error:'Too many attempts. Please try again in 15 minutes.'},{status:429});
  const account=await accounts.login(email,password);
  if(!account)return localizedJson({error:'Email or password is incorrect.'},{status:401});
  await setSession(account);return localizedJson({ok:true});
 }catch{return localizedJson({error:'Could not sign in. Please try again.'},{status:400});}
}
