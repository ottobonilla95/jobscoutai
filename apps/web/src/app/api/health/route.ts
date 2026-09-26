import {localizedJson} from '@/lib/language';
import { getAccounts } from '@core/accounts';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { (await getAccounts().db.prepare('SELECT 1').get()); return localizedJson({ status: 'ok' }); }
  catch { return localizedJson({ status: 'unavailable' }, { status: 503 }); }
}
