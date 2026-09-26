import { redirect } from 'next/navigation';
import { authenticated, withUserStore } from '@/lib/auth';
import { dashboard } from '@/lib/dashboard';
import Dashboard from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!await authenticated()) redirect('/login');
  const initial=await withUserStore(dashboard);
  if(!initial.profile.onboardingCompleted)redirect('/onboarding');
  return <Dashboard initial={initial} />;
}
