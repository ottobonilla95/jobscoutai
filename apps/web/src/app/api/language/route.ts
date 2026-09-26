import {brand} from '@core/brand';
import {cookies} from 'next/headers';
import {z} from 'zod';
import {currentAccount,sameOrigin,limitedBody} from '@/lib/auth';
import {localizedJson} from '@/lib/language';
import {getAccounts} from '@core/accounts';
import {languagePreference,resolveLocale} from '@core/i18n/locale';
export async function POST(request:Request){
 if(!sameOrigin(request))return localizedJson({error:'Request origin is not allowed.'},{status:403});
 try{
  const input=z.object({preference:z.enum(['auto','en','es']).optional(),sync:z.boolean().optional()}).parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,1000))));
  const account=await currentAccount();const jar=await cookies();
  const preference=input.preference??(account?(await getAccounts().language(account.id)).preference:languagePreference(jar.get(brand.compatibility.languageCookie)?.value));
  const locale=resolveLocale(preference,request.headers.get('accept-language'));
  if(account)(await getAccounts().setLanguage(account.id,preference,locale));
  if(input.preference)jar.set(brand.compatibility.languageCookie,preference,{path:'/',httpOnly:true,sameSite:'lax',secure:(process.env.APP_URL||'').startsWith('https:'),maxAge:31536000});
  return Response.json({preference,locale});
 }catch{return localizedJson({error:'Could not save your language preference.'},{status:400});}
}
