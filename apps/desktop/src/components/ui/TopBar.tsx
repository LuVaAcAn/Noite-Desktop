import { lockAllProfiles } from '../../lib/native-profile-auth';
import { profileDisplayName } from '@proyecto-noche/domain';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, CalendarClock, ChevronDown, Home, LogOut, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../../hooks/use-settings';
import { useUpcomingPlanReminders } from '../../hooks/use-notifications';
import { ProfileAvatar } from './ProfileAvatar';
import { useUiStore } from '../../stores/ui-store';
import { dateLocale, translate } from '../../lib/i18n';

interface TopBarProps { showBack?: boolean }

export function TopBar({ showBack }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: settings } = useSettings();
  const currentQuery = new URLSearchParams(location.search).get('q') ?? '';
  const [searchTerm, setSearchTerm] = useState(currentQuery);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const reminders = useUpcomingPlanReminders();
  const returnToTitle = useUiStore((state) => state.returnToTitle);


  useEffect(() => setSearchTerm(currentQuery), [currentQuery]);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = searchTerm.trim();
    if (term) navigate(`/buscar?q=${encodeURIComponent(term)}`);
  }

  const actorName = settings ? profileDisplayName(settings, settings.activeProfileId) : '';
  const actorAvatar = settings?.activeProfileId === settings?.profiles.partner.id ? settings?.partnerAvatarUrl : settings?.userAvatarUrl;
  return (
    <header className="app-topbar layer-header relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-noche-border/70 bg-noche-surface/70 px-[var(--shell-gutter)] py-2 backdrop-blur-xl md:grid-cols-[auto_minmax(220px,620px)_auto] md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {showBack && (
          <button aria-label={translate(settings?.locale, 'back')} onClick={() => navigate(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-noche-surface text-noche-text hover:bg-noche-surface-hover">
            <ArrowLeft size={18} />
          </button>
        )}
        <button aria-label="Ir al inicio" title="Inicio" onClick={() => navigate('/')} className="arcade-focus flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-noche-border bg-noche-surface text-noche-text transition hover:border-[rgb(var(--theme-accent))] hover:text-[rgb(var(--theme-accent))] active:scale-95">
          <Home size={19} />
        </button>
      </div>

      <form className="relative order-3 col-span-2 w-full md:order-none md:col-span-1" role="search" onSubmit={submitSearch}>
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-noche-muted" />
        <input data-controller-skip type="search" aria-label={translate(settings?.locale, 'searchActivity')} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={translate(settings?.locale, 'searchActivity')} className="h-10 w-full rounded-full border border-noche-border bg-noche-surface pl-10 pr-4 text-sm text-noche-text placeholder:text-noche-muted focus:border-pink-500 focus:outline-none" />
      </form>

      <div ref={actionsRef} className="relative flex items-center justify-end gap-2">
        <div className="relative">
          <button aria-label="Próximos planes" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); setProfileOpen(false); }} className="relative flex h-10 w-10 items-center justify-center rounded-full border border-noche-border bg-noche-surface text-noche-text hover:bg-noche-surface-hover">
            <Bell size={21} />
            {reminders.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-pink-500" />}
          </button>
          {notificationsOpen && (
            <div className="layer-header-popover absolute right-0 top-14 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-noche-border bg-noche-surface p-2 shadow-2xl">
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-noche-muted">{translate(settings?.locale, 'upcomingPlans')}</p>
              {reminders.length === 0 && <p className="px-3 py-4 text-sm text-noche-muted">{translate(settings?.locale, 'noUpcomingPlans')}</p>}
              <ul className="max-h-72 overflow-y-auto">
                {reminders.map((plan) => (
                    <li key={plan.id}><button onClick={() => { setNotificationsOpen(false); navigate(`/calendario?plan=${plan.id}`); }} className="flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-noche-surface-hover"><CalendarClock size={16} className="mt-0.5 shrink-0 text-pink-500" /><span><span className="block text-sm font-medium text-noche-text">{plan.title}</span><span className="block text-xs text-noche-muted">{new Date(plan.startsAt!).toLocaleString(dateLocale(settings?.locale))}</span></span></button></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="relative">
          <button aria-label="Perfil y persona activa" aria-expanded={profileOpen} onClick={() => { setProfileOpen((value) => !value); setNotificationsOpen(false); }} className="flex h-10 items-center gap-2 rounded-full border border-noche-border bg-noche-surface px-1.5 pr-3 text-noche-text hover:bg-noche-surface-hover">
            <ProfileAvatar name={actorName || 'Tú'} src={actorAvatar} className="h-7 w-7 text-xs" />
            <span className="hidden max-w-24 truncate text-sm font-medium lg:block">{actorName || 'Tú'}</span>
            <ChevronDown size={14} />
          </button>
          {profileOpen && (
            <div className="layer-header-popover absolute right-0 top-14 w-56 rounded-2xl border border-noche-border bg-noche-surface p-2 shadow-2xl">
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-noche-muted">Este dispositivo</p>
              <p className="rounded-xl bg-noche-bg px-3 py-2 text-sm font-semibold">{actorName || 'Tú'}</p>
              <button onClick={() => navigate('/settings')} className="mt-1 w-full border-t border-noche-border px-3 py-2.5 text-left text-sm text-noche-muted hover:text-noche-text">Ajustes</button>
              <button onClick={() => { setProfileOpen(false); void lockAllProfiles(); returnToTitle(); navigate('/'); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10"><LogOut size={14} />Volver al título</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
