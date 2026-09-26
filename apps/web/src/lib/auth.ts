import {brand} from '@core/brand';
import {localizedJson} from './language';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getAccounts } from '@core/accounts';

export const cookieName = brand.compatibility.sessionCookie;
export const currentAccount = cache(async () => getAccounts().current((await cookies()).get(cookieName)?.value));
export async function authenticated(){return Boolean(await currentAccount());}
export async function withUserStore<T>(callback: (store: import('@core/store').Store) => T | Promise<T>):Promise<T>{
  const account=await currentAccount();if(!account)throw new Error('Please sign in.');
  const store=getAccounts().store(account.id);
  try{return await callback(store);}finally{store.db.close();}
}
export async function setSession(account: import('@core/accounts').Account){
  const jar=await cookies();getAccounts().revoke(jar.get(cookieName)?.value);
  jar.set(cookieName,getAccounts().session(account),{httpOnly:true,secure:(process.env.APP_URL||'').startsWith('https://'),sameSite:'strict',path:'/',maxAge:7*86400});
}
export function sameOrigin(request:Request){
  const expected=new URL(process.env.APP_URL||'http://localhost:3000').origin;
  return request.headers.get('origin')===expected;
}
export async function guard(request?:Request){
  if(!await currentAccount())return localizedJson({error:'Please sign in.'},{status:401});
  if(request&&!sameOrigin(request))return localizedJson({error:'Request origin is not allowed.'},{status:403});
  return null;
}
export async function limitedBody(request: Request, limit = 200000): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new Error('Request too large.');
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('Request too large.'); }
    chunks.push(value);
  }
  const result = new Uint8Array(size); let position = 0;
  for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
  return result;
}
