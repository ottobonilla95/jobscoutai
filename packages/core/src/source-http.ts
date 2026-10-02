import { brand } from './brand';
import { SourceError } from './linkedin';

let lastRequest = 0;
export async function publicData(url: string, label: string, sameOriginRedirects = false): Promise<string> {
  const origin = new URL(url).origin;
  for (let hop = 0; hop < 4; hop++) {
    const pause = 1200 - (Date.now() - lastRequest);
    if (pause > 0) await new Promise(resolve => setTimeout(resolve, pause));
    lastRequest = Date.now();
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000),
      headers: { Accept: 'application/json, text/html', 'User-Agent': brand.httpAgent } });
    if (sameOriginRedirects && [301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new SourceError(`${label}: invalid redirect. This source was skipped.`, true);
      const next = new URL(location, url);
      if (next.origin !== origin || next.username || next.password) throw new SourceError(`${label}: unexpected redirect. This source was skipped.`, true);
      url = next.href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SourceError(`${label}: HTTP ${response.status}. This source was skipped.`, true);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new SourceError(`${label}: empty response.`, true);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new SourceError(`${label}: response too large.`, true); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  throw new SourceError(`${label}: too many redirects. This source was skipped.`, true);
}
