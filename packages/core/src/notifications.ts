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
  const candidates = store.jobs().filter(job => sourceEnabled(profile, job.sourceKey) && strongMatch(job,profile,version) &&
    !store.db.prepare('SELECT 1 FROM delivery_jobs WHERE job_id=?').get(job.id)).slice(0,10);
  if (candidates.length) {
    const id = randomUUID();
    const text = candidates.map(job => `${job.title} — ${job.company}\n${job.location}\n${t('Recommendation')}: ${t(recommendationLabels[recommendation(job)])}\n${t('Fit')}: ${formatNumber(job.assessment!.score,profile.outputLanguage)}/100\n${job.assessment!.summary}\n${t('Equity')}: ${job.assessment!.equityEvidence || t('Not specified')}\n${t('Questions')}: ${job.assessment!.concerns.join('; ') || t('None flagged')}\n${job.url}`).join('\n\n————\n\n');
    const payload: EmailPayload = { from: process.env.EMAIL_FROM, to: [profile.email],
      subject: t(candidates.length===1?'{count} new job match for you':'{count} new job matches for you',{count:formatNumber(candidates.length,profile.outputLanguage)}),
      text: `${t('New opportunities matching your saved profile.')}\n\n${text}\n\n${t('Review your matches')}: ${process.env.APP_URL || 'http://localhost:3000'}` };
    store.db.exec('BEGIN IMMEDIATE');
    try {
      store.db.prepare('INSERT INTO deliveries(id,payload,created_at) VALUES(?,?,?)').run(id, JSON.stringify(payload), new Date().toISOString());
      for (const job of candidates) store.db.prepare('INSERT INTO delivery_jobs VALUES(?,?)').run(job.id, id);
      store.db.exec('COMMIT');
    } catch (e) { store.db.exec('ROLLBACK'); throw e; }
  }
  let sent = 0;
  for (const batch of store.db.prepare("SELECT * FROM deliveries WHERE status='pending' ORDER BY created_at LIMIT 3").all()) {
    const payload = JSON.parse(String(batch.payload)) as EmailPayload;
    const savedJobs=store.db.prepare('SELECT job_id FROM delivery_jobs WHERE delivery_id=?').all(batch.id).map(r=>store.job(String(r.job_id)));
    if(savedJobs.some(job=>!job||!strongMatch(job,profile,version))){store.db.prepare("UPDATE deliveries SET status='review', error='Matching preferences or job eligibility changed; review this digest.' WHERE id=?").run(batch.id);continue;}
    const sources = store.db.prepare('SELECT j.source_key FROM jobs j JOIN delivery_jobs d ON j.id=d.job_id WHERE d.delivery_id=?').all(batch.id);
    if (sources.some(row => !sourceEnabled(profile, String(row.source_key)))) {
      store.db.prepare("UPDATE deliveries SET status='review', error='A job source was disabled; this saved digest needs review.' WHERE id=?").run(batch.id);
      continue;
    }
    if (payload.to[0] !== profile.email) {
      store.db.prepare("UPDATE deliveries SET status='review', error='Recipient changed; review delivery before resending.' WHERE id=?").run(batch.id);
      continue;
    }
    // Resend's deduplication window is 24h. Don't risk a second send after that window.
    if (Date.now() - Date.parse(String(batch.created_at)) > 23 * 3600000) {
      store.db.prepare("UPDATE deliveries SET status='review', error='Delivery uncertain after retry window; check the email provider.' WHERE id=?").run(batch.id);
      continue;
    }
    try {
      await send(payload, String(batch.id));
      const now = new Date().toISOString();
      store.db.exec('BEGIN IMMEDIATE');
      store.db.prepare("UPDATE deliveries SET status='sent',sent_at=?,error=NULL WHERE id=?").run(now, batch.id);
      store.db.prepare('UPDATE jobs SET notified_at=? WHERE id IN (SELECT job_id FROM delivery_jobs WHERE delivery_id=?)').run(now, batch.id);
      store.db.exec('COMMIT'); sent++;
    } catch (error) {
      if (store.db.isTransaction) store.db.exec('ROLLBACK');
      const message = error instanceof Error ? error.message : 'Email delivery failed.';
      store.db.prepare('UPDATE deliveries SET error=? WHERE id=?').run(message.slice(0,300), batch.id);
      throw new Error(message);
    }
  }
  return sent;
}
