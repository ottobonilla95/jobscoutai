'use client';
import AccountSettings from './account-settings';
import {useI18n} from './i18n';
import WorkspaceSidebar from './workspace-sidebar';

export default function Settings({name,matchCount}:{name:string;matchCount:number}) {
  const {t}=useI18n();
  return <div className="app-shell">
    <WorkspaceSidebar activeView="settings" name={name} matchCount={matchCount}/>
    <main className="main-content">
      <div className="topline"><span>{t('WORKSPACE /')} {t('Settings')}</span><span className="private-badge"><span className="tiny-dot"/>{t('Your private job-search assistant')}</span></div>
      <header className="page-header"><div><h1>{t('Settings')}</h1><p className="muted">{t('Language and account preferences')}</p></div></header>
      <AccountSettings/>
    </main>
  </div>;
}
