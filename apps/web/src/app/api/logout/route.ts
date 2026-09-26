import {localizedJson} from '@/lib/language';
import { getAccounts } from '@core/accounts';
import { cookies } from 'next/headers';
import { cookieName, guard } from '@/lib/auth';
export async function POST(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  const jar=await cookies(); getAccounts().revoke(jar.get(cookieName)?.value); jar.delete(cookieName);
  return localizedJson({ ok: true });
}
