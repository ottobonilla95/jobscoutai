'use client';

import type {ReactNode} from 'react';
import Link from 'next/link';
import {Compass, FileText, SlidersHorizontal, Search, LockKeyhole} from 'lucide-react';
import {brand} from '@core/brand';
import {LanguageSelect, useI18n} from './i18n';

export default function AuthShell({children}:{children:ReactNode}) {
  const {t}=useI18n();
  return <main className="auth-page">
    <header className="auth-header">
      <Link href="/login" className="brand"><span className="brand-icon"><Compass size={23}/></span><span>{brand.name}</span></Link>
      <LanguageSelect/>
    </header>
    <div className="auth-layout">
      <aside className="auth-intro" aria-labelledby="auth-intro-title">
        <h2 id="auth-intro-title">{t('Your search. Your next chapter.')}</h2>
        <p>{t('Bring your experience. Define what matters. Find opportunities worth a closer look.')}</p>
        <ol className="auth-journey">
          <li><FileText size={20}/><div><strong>{t('Your experience')}</strong><p>{t('Start with your CV and the work you know.')}</p></div></li>
          <li><SlidersHorizontal size={20}/><div><strong>{t('Your direction')}</strong><p>{t('Shape your search in a conversation.')}</p></div></li>
          <li><Search size={20}/><div><strong>{t('Your shortlist')}</strong><p>{t('Review the fit, evidence, and questions together.')}</p></div></li>
        </ol>
        <p className="auth-privacy"><LockKeyhole size={16}/>{t('Your CV and job list stay in your account.')}</p>
      </aside>
      <section className="login-card auth-form">{children}</section>
    </div>
  </main>;
}
