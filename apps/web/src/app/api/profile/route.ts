import {localizedJson} from '@/lib/language';
import { guard, limitedBody, withUserStore, currentAccount } from '@/lib/auth';
import {requestLanguage} from '@/lib/language';
import {getAccounts} from '@core/accounts';
import { ZodError } from 'zod';
import { minimumSearchIntervalHours } from '@core/search-policy';
import { profileSchema } from '@core/profile';
export async function PUT(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  try {
    const value = JSON.parse(new TextDecoder().decode(await limitedBody(request)));
    const profile = profileSchema.parse({...value,outputLanguage:(await requestLanguage()).locale});
    const current=await withUserStore(async store=>(await store.profile()).profile);
    if(!current.onboardingCompleted)return localizedJson({error:'Complete your search profile first.'},{status:400});
    profile.onboardingCompleted=current.onboardingCompleted;profile.setupDraft=current.setupDraft;
    if(profile.intervalHours<minimumSearchIntervalHours())return localizedJson({error:'Choose a search frequency at or above the minimum.'},{status:400});
    if (profile.enabled && profile.cvText.length < 100) return localizedJson({ error: 'Add at least 100 characters of CV text before enabling searches.' }, { status: 400 });
    if (profile.emailEnabled && !profile.email) return localizedJson({ error: 'Enter your email address before enabling notifications.' }, { status: 400 });
    const account=(await currentAccount())!;
    if(profile.emailEnabled&&(!(await getAccounts().verified(account.id))||profile.email.toLowerCase()!==account.email))return localizedJson({error:'Verify your account email and use that address for job notifications.'},{status:400});
    await withUserStore(async store => (await store.saveProfile(profile)));
    return localizedJson({ ok: true });
  } catch (error) { return localizedJson({ error: error instanceof ZodError ? 'Check your profile settings and try again.' : 'Could not save your profile.' }, { status: 400 }); }
}
