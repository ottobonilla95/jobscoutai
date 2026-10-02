import { useState } from 'react';
import { Activity, Compass, LogOut, Search, SlidersHorizontal } from 'lucide-react';
import { brand } from '@core/brand';
import { useI18n } from './i18n';

export type DashboardView = 'matches' | 'profile' | 'activity';
type WorkspaceView = DashboardView | 'settings';
const navigation = [
  {view: 'matches', label: 'Opportunities', href: '/?view=matches', Icon: Search},
  {view: 'profile', label: 'Search profile', href: '/?view=profile', Icon: SlidersHorizontal},
  {view: 'activity', label: 'Activity', href: '/?view=activity', Icon: Activity},
  {view: 'settings', label: 'Settings', href: '/settings', Icon: SlidersHorizontal},
] as const;

export default function WorkspaceSidebar({activeView, name, matchCount, dirty = false, onNavigate, onSignOutError}: {
  activeView: WorkspaceView;
  name: string;
  matchCount: number;
  dirty?: boolean;
  onNavigate?: (view: DashboardView) => void;
  onSignOutError?: (message: string) => void;
}) {
  const {t} = useI18n();
  const [error, setError] = useState('');
  async function signOut() {
    setError('');
    try {
      const response = await fetch('/api/logout', {method: 'POST'});
      if (!response.ok) throw new Error();
      window.location.assign('/login');
    } catch {
      const message = t('Could not sign out. Please try again.');
      if (onSignOutError) onSignOutError(message);
      else setError(message);
    }
  }
  return <aside className="sidebar">
    <a className="brand" href="/"><span className="brand-icon"><Compass size={23}/></span><span>{brand.name}</span></a>
    <div className="workspace-label">{t('YOUR WORKSPACE')}</div>
    <nav aria-label={t('Workspace')}>
      {navigation.map(({view, label, href, Icon}) => <a key={view} href={href} className={`nav-item${activeView === view ? ' active' : ''}`} aria-current={activeView === view ? 'page' : undefined} onClick={event => {
        if (view !== 'settings' && onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
          event.preventDefault(); onNavigate(view);
        }
      }}><Icon size={18}/>{t(label)}{view === 'matches' && <span className="nav-count">{matchCount}</span>}{view === 'profile' && dirty && <span className="dirty-dot"/>}</a>)}
    </nav>
    <div className="sidebar-bottom"><div className="avatar">{name ? name[0].toUpperCase() : 'Y'}</div><div><strong>{name || t('Your workspace')}</strong><small>{t('Your account · Private')}</small></div><button type="button" className="icon-button" aria-label={t('Sign out')} onClick={() => void signOut()}><LogOut size={16}/></button></div>
    {error && <p role="alert" className="sidebar-error">{error}</p>}
  </aside>;
}
