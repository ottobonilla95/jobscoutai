import {redirect} from 'next/navigation';
import {authenticated,withUserStore} from '@/lib/auth';
import {CvStore} from '@core/cv-store';
import {strongMatch} from '@core/recommendation';
import CvBuilder from '@/components/cv-builder';
export const dynamic='force-dynamic';
export default async function Page(){
  if(!await authenticated())redirect('/login');
  const data=await withUserStore(async store=>{
    const [{profile,version},jobs,cvs]=await Promise.all([store.profile(),store.jobs(),new CvStore(store.db,store.userId).list()]);
    return {name:profile.name,matchCount:jobs.filter(job=>strongMatch(job,profile,version)).length,initialCvs:cvs,sourceText:profile.cvText};
  });
  return <CvBuilder {...data}/>;
}
