import {localizedJson} from '@/lib/language';
import {requestLanguage} from '@/lib/language';
import {translate} from '@core/i18n';
import { sameOrigin, limitedBody, setSession } from '@/lib/auth';
import { getAccounts, credentialsSchema } from '@core/accounts';
export async function POST(request:Request){
 if(!sameOrigin(request))return localizedJson({error:'Request origin is not allowed.'},{status:403});
 if(process.env.ALLOW_SIGNUP==='false')return localizedJson({error:'New registrations are currently closed.'},{status:403});
 const accounts=getAccounts();
 if(!accounts.allow('signup:global',20,3600000))return localizedJson({error:'Too many signup attempts. Please try again later.'},{status:429});
 try{
  const parsed=credentialsSchema.safeParse(JSON.parse(new TextDecoder().decode(await limitedBody(request,4000))));
  if(!parsed.success)return localizedJson({error:'Enter a valid email and a password of 12–128 characters.'},{status:400});
  const language=await requestLanguage();
  const account=await accounts.signup(parsed.data);
  accounts.setLanguage(account.id,language.preference,language.locale);
  const store=accounts.store(account.id);try{const profile=store.profile().profile;store.saveProfile({...profile,email:account.email,objective:translate(language.locale,profile.objective),strategy:{...profile.strategy,groups:profile.strategy.groups.map(g=>({...g,label:translate(language.locale,g.label),criteria:g.criteria.map(c=>({...c,label:translate(language.locale,c.label),rubric:translate(language.locale,c.rubric)}))}))}});}finally{store.db.close();}
  await setSession(account);return localizedJson({ok:true},{status:201});
 }catch{return localizedJson({error:'Could not create this account. If you already have an account, sign in.'},{status:400});}
}
