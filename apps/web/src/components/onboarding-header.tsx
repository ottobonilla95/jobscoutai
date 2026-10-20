'use client';
import {useState} from 'react';
import {ArrowLeft,LogOut,Settings} from 'lucide-react';
import {brand} from '@core/brand';
import {useI18n} from './i18n';

export default function OnboardingHeader({settings=false}:{settings?:boolean}){
  const {t}=useI18n();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function signOut(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/logout',{method:'POST'});
      if(!response.ok)throw new Error();
      window.location.assign('/login');
    }catch{
      setError(t('Could not sign out. Please try again.'));
      setBusy(false);
    }
  }
  return <header className="onboarding-header">
    <div className="onboarding-header-row">
      <a className="brand" href="/onboarding">{brand.name}</a>
      <nav aria-label={t('Your account')}>
        {settings?<a className="text-button" href="/onboarding"><ArrowLeft size={16}/>{t('Continue setup')}</a>
          :<a className="text-button" href="/settings"><Settings size={16}/>{t('Settings')}</a>}
        <button type="button" className="text-button" disabled={busy} onClick={()=>void signOut()}><LogOut size={16}/>{t('Sign out')}</button>
      </nav>
    </div>
    {error&&<p role="alert" className="error-text">{error}</p>}
  </header>;
}
