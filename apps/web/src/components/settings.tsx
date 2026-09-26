'use client';
import {brand} from '@core/brand';
import Link from 'next/link';
import AccountSettings from './account-settings';
import {useI18n} from './i18n';
export default function Settings(){const {t}=useI18n();return <main className="settings-page"><Link className="brand" href="/">{brand.name}</Link><Link className="text-button" href="/">← {t('Opportunities')}</Link><h1>{t('Settings')}</h1><p className="muted">{t('Language and account preferences')}</p><AccountSettings/></main>;}
