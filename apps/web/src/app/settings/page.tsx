import {redirect} from 'next/navigation';
import {currentAccount,withUserStore} from '@/lib/auth';
import {getAccounts} from '@core/accounts';
import {strongMatch} from '@core/recommendation';
import Settings from '@/components/settings';
export const dynamic='force-dynamic';
export default async function Page(){
  const account=await currentAccount();
  if(!account)redirect('/login');
  const summary=await withUserStore(async store=>{
    const [{profile,version},jobs,verified]=await Promise.all([store.profile(),store.jobs(),getAccounts().verified(account.id)]);
    return {name:profile.name,matchCount:jobs.filter(job=>strongMatch(job,profile,version)).length,onboardingCompleted:profile.onboardingCompleted,
      account:{email:account.email,verified,emailAvailable:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)}};
  });
  return <Settings {...summary}/>;
}
