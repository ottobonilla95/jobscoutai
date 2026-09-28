import {translate} from './i18n';
import {formatNumber} from './i18n/locale';
import { strongMatch, recommendation, recommendationLabels } from './recommendation';
import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Profile } from './profile';
import { sourceEnabled } from './source-settings';

export type EmailPayload = { from: string; to: string[]; subject: string; text: string };
export async function sendEmail(payload: EmailPayload, id: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': id },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}. Check sender verification and credentials.`);
}
export async function notifyMatches(store: Store, profile: Profile, version: number,
  send: (payload: EmailPayload, id: string) => Promise<void> = sendEmail): Promise<number> {
  const t=(key:string,params?:Record<string,string|number>)=>translate(profile.outputLanguage||'en',key,params);
  if (!profile.emailEnabled || !profile.email) return 0;
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('Email is enabled but RESEND_API_KEY or EMAIL_FROM is missing. Matches are saved in the dashboard.');

  // Persist the exact payload before contacting the provider. Retries reuse its idempotency key.
  const reserved=await store.reservedJobs();
  const candidates = (await store.jobs()).filter(job => sourceEnabled(profile, job.sourceKey) && strongMatch(job,profile,version) &&
    !reserved.includes(job.id)).slice(0,10);
  if (candidates.length) {
    const id = randomUUID();
    const text = candidates.map(job => `${job.title} — ${job.company}\n${job.location}\n${t('Recommendation')}: ${t(recommendationLabels[recommendation(job)])}\n${t('Fit')}: ${formatNumber(job.assessment!.score,profile.outputLanguage)}/100\n${job.assessment!.summary}\n${t('Equity')}: ${job.assessment!.equityEvidence || t('Not specified')}\n${t('Questions')}: ${job.assessment!.concerns.join('; ') || t('None flagged')}\n${job.url}`).join('\n\n————\n\n');
    const payload: EmailPayload = { from: process.env.EMAIL_FROM, to: [profile.email],
      subject: t(candidates.length===1?'{count} new job match for you':'{count} new job matches for you',{count:formatNumber(candidates.length,profile.outputLanguage)}),
      text: `${t('New opportunities matching your saved profile.')}\n\n${text}\n\n${t('Review your matches')}: ${process.env.APP_URL || 'http://localhost:3000'}` };
    await store.enqueueDelivery(id,payload,candidates.map(job=>job.id));
  }
  let sent = 0;
  for (const batch of await store.pendingDeliveries()) {
    const payload = JSON.parse(String(batch.payload)) as EmailPayload;
    const savedJobs=await store.deliveryJobs(String(batch.id));
    // A deleted account cascades its queue and jobs, even if this worker already read the batch.
    if(!savedJobs.length)continue;
    if(savedJobs.some(job=>!strongMatch(job,profile,version))){await store.holdDelivery(String(batch.id),'Matching preferences or job eligibility changed; review this digest.');continue;}
    if(savedJobs.some(job=>!sourceEnabled(profile,job.sourceKey))){await store.holdDelivery(String(batch.id),'A job source was disabled; this saved digest needs review.');continue;}
    if (payload.to[0] !== profile.email) {
      await store.holdDelivery(String(batch.id),'Recipient changed; review delivery before resending.');
      continue;
    }
    // Resend's deduplication window is 24h. Don't risk a second send after that window.
    if (Date.now() - Date.parse(String(batch.created_at)) > 23 * 3600000) {
      await store.holdDelivery(String(batch.id),'Delivery uncertain after retry window; check the email provider.');
      continue;
    }
    try {
      await send(payload, String(batch.id));
      await store.sentDelivery(String(batch.id));sent++;
    } catch(error){
      const message = error instanceof Error ? error.message : 'Email delivery failed.';
      await store.deliveryError(String(batch.id),message);
      throw new Error(message);
    }
  }
  return sent;
}
