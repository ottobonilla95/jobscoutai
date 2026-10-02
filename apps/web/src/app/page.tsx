import { redirect } from 'next/navigation';
import { authenticated, withUserStore } from '@/lib/auth';
import { dashboard } from '@/lib/dashboard';
import Dashboard from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string|string[]}>}) {
  if (!await authenticated()) redirect('/login');
  const initial=await withUserStore(dashboard);
  if(!initial.profile.onboardingCompleted)redirect('/onboarding');
  const {view}=await searchParams;
  return <Dashboard initial={initial} initialView={view==='matches'||view==='profile'||view==='activity'?view:undefined}/>;
}
