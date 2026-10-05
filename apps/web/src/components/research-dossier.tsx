'use client';
import type {ResearchDossier} from '@core/research-memory-schema';
import {useI18n} from './i18n';
export default function ResearchDossierView({dossier,currentVersion}:{dossier:ResearchDossier|null|undefined;currentVersion:number}){
 const {t,date}=useI18n();
 if(!dossier)return <p className="footnote">{t('Research evidence is saved when this opportunity is evaluated.')}</p>;
 return <details className="job-details research-dossier"><summary>{t('Research memory and sources')}</summary>
  {dossier.profileVersion!==currentVersion&&<p className="footnote">{t('This research used an earlier profile. Its sources remain available; the next investigation will use your current priorities.')}</p>}
  <p>{dossier.summary}</p><p className="footnote">{t('Research updated: {date}',{date:date(dossier.updatedAt)})}</p>
  {dossier.evidence.some(e=>e.scope==='company')&&<p className="footnote">{t('Company sources are matched by name. Confirm the employer identity before relying on them.')}</p>}
  <h3>{t('Evidence and source dates')}</h3>
  {!dossier.evidence.length?<p className="muted">{t('No supported excerpts have been saved yet.')}</p>:<ul className="research-evidence-list">{dossier.evidence.map(e=><li key={e.id}>
   <strong>{e.topic}</strong> <span className="pill neutral">{t(e.scope==='company'?'Company evidence':'Role evidence')}</span> <span className="pill neutral">{t(e.stance==='contradicts'?'Conflicting evidence':'Supporting evidence')}</span>
   <p>{e.claim}</p><blockquote>{e.quote}</blockquote><a href={e.url} target="_blank" rel="noopener noreferrer">{t('Read evidence source ↗')}</a>
   <p className="footnote">{t('Source retrieved: {date}',{date:date(e.retrievedAt)})} {t('Recorded: {date}',{date:date(e.recordedAt)})}{Date.now()-Date.parse(e.retrievedAt)>30*86400000&&<span> {t('Source recheck due')}</span>}</p>
  </li>)}</ul>}
  <h3>{t('Questions still worth answering')}</h3>
  {!dossier.questions.length?<p className="muted">{t('No research questions have been recorded.')}</p>:<ul>{dossier.questions.map(q=><li key={q.id}><strong>{q.question}</strong> <span className="pill neutral">{t(q.status==='answered'?'Answered':q.status==='conflicting'?'Conflicting evidence':'Unanswered')}</span>{q.answer&&<p>{q.answer}</p>}</li>)}</ul>}
 </details>;
}
