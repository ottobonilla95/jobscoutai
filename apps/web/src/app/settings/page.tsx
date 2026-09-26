import {redirect} from 'next/navigation';
import {authenticated} from '@/lib/auth';
import Settings from '@/components/settings';
export default async function Page(){if(!await authenticated())redirect('/login');return <Settings/>;}
