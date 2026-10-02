import {redirect} from 'next/navigation';
import {authenticated,withUserStore} from '@/lib/auth';
import {strongMatch} from '@core/recommendation';
import Settings from '@/components/settings';
export const dynamic='force-dynamic';
export default async function Page(){
  if(!await authenticated())redirect('/login');
  const summary=await withUserStore(async store=>{
    const [{profile,version},jobs]=await Promise.all([store.profile(),store.jobs()]);
    return {name:profile.name,matchCount:jobs.filter(job=>strongMatch(job,profile,version)).length};
  });
  return <Settings {...summary}/>;
}
