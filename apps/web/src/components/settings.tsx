'use client';
import AccountSettings,{type AccountStatus} from './account-settings';
import {useI18n} from './i18n';
import WorkspaceSidebar from './workspace-sidebar';
import OnboardingHeader from './onboarding-header';

export default function Settings({name,matchCount,onboardingCompleted,account}:{name:string;matchCount:number;onboardingCompleted:boolean;account:AccountStatus}) {
  const {t}=useI18n();
  if(!onboardingCompleted)return <main className="onboarding-page chat-onboarding-page settings-onboarding">
    <OnboardingHeader settings/>
    <header className="page-header"><div><h1>{t('Settings')}</h1><p className="muted">{t('Language and account preferences')}</p></div></header>
    <AccountSettings account={account}/>
  </main>;
  return <div className="app-shell review-shell settings-workspace">
    <a className="review-skip" href="#workspace-main">{t('Skip to content')}</a>
    <WorkspaceSidebar activeView="settings" name={name} matchCount={matchCount}/>
    <main id="workspace-main" className="main-content">
      <header className="review-header"><div><h1>{t('Settings')}</h1><p>{t('Language and account preferences')}</p></div></header>
      <AccountSettings account={account}/>
    </main>
  </div>;
}
