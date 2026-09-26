import { redirect } from 'next/navigation';
import { currentAccount, withUserStore } from '@/lib/auth';
import { minimumSearchIntervalHours } from '@core/search-policy';
import SearchProfile from '@/components/search-profile';
import { brand } from '@core/brand';
export const dynamic='force-dynamic';
export default async function OnboardingPage() {
  const account=await currentAccount();if(!account)redirect('/login');
  const {profile}=await withUserStore(store=>store.profile());
  if(profile.onboardingCompleted)redirect('/');
  return <main className="onboarding-page"><a className="brand" href="/">{brand.name}</a><SearchProfile profile={profile} minimum={minimumSearchIntervalHours()} onboarding/></main>;
}
