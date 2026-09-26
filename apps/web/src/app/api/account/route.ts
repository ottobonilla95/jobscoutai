import {localizedJson} from '@/lib/language';
import {z} from 'zod';
import {currentAccount,sameOrigin,limitedBody} from '@/lib/auth';
import {getAccounts} from '@core/accounts';
import {sendAccountLink} from '@core/account-email';
export async function GET(){const account=await currentAccount();if(!account)return localizedJson({error:'Please sign in.'},{status:401});return localizedJson({email:account.email,verified:getAccounts().verified(account.id),emailAvailable:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)});}
export async function POST(request:Request){
 if(!sameOrigin(request))return localizedJson({error:'Request origin is not allowed.'},{status:403});
 const accounts=getAccounts();if(!accounts.allow('account:global',60,900000))return localizedJson({error:'Too many attempts. Please try again later.'},{status:429});
 try{const input=JSON.parse(new TextDecoder().decode(await limitedBody(request,5000)));
  if(input.action==='consume'){
   const value=z.object({token:z.string().length(43),purpose:z.enum(['reset','verify']),password:z.string().min(12).max(128).optional()}).parse(input);
   const ok=await accounts.consumeToken(value.token,value.purpose,value.password);return localizedJson(ok?{ok:true}:{error:'This link is invalid or expired. Request a new one.'},{status:ok?200:400});
  }
  if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return localizedJson({error:'Email delivery is not connected yet. Contact the platform owner.'},{status:503});
  if(input.action==='verify'){
   const account=await currentAccount();if(!account)return localizedJson({error:'Please sign in.'},{status:401});
   if(accounts.verified(account.id))return localizedJson({message:'Your email is already verified.'});
   if(!accounts.allow(`verify-email:${account.id}`,3,3600000))return localizedJson({error:'Please wait before requesting another verification link.'},{status:429});
   await sendAccountLink(accounts,account,'verify');return localizedJson({message:'Verification link sent. Check your email.'});
  }
  if(input.action!=='reset')throw new Error('Invalid action');
  const email=z.email().parse(String(input.email||'').trim().toLowerCase());
  if(accounts.allow(`reset:${email}`,3,3600000)){
   const row=accounts.db.prepare('SELECT id,email FROM accounts WHERE email=?').get(email);
   if(row)await sendAccountLink(accounts,{id:String(row.id),email:String(row.email)},'reset').catch(()=>{});
  }
  return localizedJson({message:'If an account exists for this email, a reset link will be sent.'});
 }catch{return localizedJson({error:'Could not complete this request. Check your details and try again.'},{status:400});}
}
