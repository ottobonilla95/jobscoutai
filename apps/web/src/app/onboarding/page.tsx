import { redirect } from 'next/navigation';
import { currentAccount, withUserStore } from '@/lib/auth';
import SearchChat from '@/components/search-chat';
import OnboardingHeader from '@/components/onboarding-header';
export const dynamic='force-dynamic';
export default async function OnboardingPage() {
  const account=await currentAccount();if(!account)redirect('/login');
  const {profile}=await withUserStore(store=>store.profile());
  if(profile.onboardingCompleted)redirect('/');
  return <main className="onboarding-page chat-onboarding-page"><OnboardingHeader/><SearchChat onboarding/></main>;
}
