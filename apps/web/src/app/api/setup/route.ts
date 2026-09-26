import { localizedJson, requestLanguage } from '@/lib/language';
import { guard, limitedBody, currentAccount, withUserStore } from '@/lib/auth';
import { getAccounts } from '@core/accounts';
import { setupDraftSchema } from '@core/setup-schema';
import { completeSetup } from '@core/search-setup';
import { minimumSearchIntervalHours } from '@core/search-policy';

export async function PUT(request:Request) {
  const denied=await guard(request);if(denied)return denied;
  try {
    const draft=setupDraftSchema.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,600000))));
    await withUserStore(store=>store.saveSetupDraft(draft));
    return localizedJson({ok:true});
  } catch {return localizedJson({error:'Could not save your progress. Please try again.'},{status:400});}
}
export async function POST(request:Request) {
  const denied=await guard(request);if(denied)return denied;
  try {
    const draft=setupDraftSchema.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,600000))));
    const account=(await currentAccount())!;
    const verified=await getAccounts().verified(account.id);
    const language=await requestLanguage();
    await withUserStore(async store=>{
      const {profile}=await store.profile();
      const complete=completeSetup({...profile,outputLanguage:language.locale},draft,minimumSearchIntervalHours(),account.email,verified);
      await store.saveProfile(complete);
    });
    return localizedJson({ok:true,verificationNeeded:draft.answers.emailAlerts&&!verified});
  } catch {return localizedJson({error:'Complete the required questions and update your matching preferences before finishing.'},{status:400});}
}
