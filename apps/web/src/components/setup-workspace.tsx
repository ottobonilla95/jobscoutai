'use client';

import type {ReactNode} from 'react';
import {Check, LockKeyhole} from 'lucide-react';
import {useI18n} from './i18n';

export default function SetupWorkspace({step,children}:{step:1|2;children:ReactNode}) {
  const {t}=useI18n();
  return <div className="setup-workspace">
    <aside className="setup-guide" aria-labelledby="setup-guide-title">
      <h2 id="setup-guide-title">{t('Make the search yours.')}</h2>
      <p>{t('A little context helps your assistant look in the right direction.')}</p>
      <ol className="setup-guide-steps" aria-label={t('Search setup')}>
        <li className={step===2?'complete':''} aria-current={step===1?'step':undefined}><span aria-hidden="true">{step===2?<Check size={16}/>:1}</span><div><strong>{t('Your CV')}</strong><p>{t('Add and review your experience.')}</p></div></li>
        <li aria-current={step===2?'step':undefined}><span aria-hidden="true">2</span><div><strong>{t('Your search')}</strong><p>{t('Talk through your goals, then review your preferences.')}</p></div></li>
      </ol>
      <p className="setup-guide-note"><LockKeyhole size={16}/>{t('Only the extracted text is saved. Your original file is not stored.')}</p>
    </aside>
    <div className="setup-workspace-main">{children}</div>
  </div>;
}
