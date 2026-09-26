import {localizedJson} from '@/lib/language';
import { guard, withUserStore } from '@/lib/auth';
import { dashboard } from '@/lib/dashboard';
export const dynamic = 'force-dynamic';
export async function GET() { const denied = await guard(); return denied || localizedJson(await withUserStore(dashboard)); }
