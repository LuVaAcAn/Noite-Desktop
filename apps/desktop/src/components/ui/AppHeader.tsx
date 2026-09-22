import { Calendar, Clapperboard, Gamepad2, Heart, Music2, Shuffle, Tv } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TopBar } from './TopBar';
import { NavPill } from './NavPill';
import { useSettings } from '../../hooks/use-settings';
import { translate, type TranslationKey } from '../../lib/i18n';

const BUILT_IN_ITEMS = [
  { key: 'juegos', labelKey: 'games', icon: Gamepad2, colorClass: 'bg-violet-600' },
  { key: 'peliculas', labelKey: 'movies', icon: Clapperboard, colorClass: 'bg-category-peliculas' },
  { key: 'series', labelKey: 'series', icon: Tv, colorClass: 'bg-category-series' },
  { key: 'favoritos', labelKey: 'favorites', icon: Heart, colorClass: 'bg-violet-600' },
] as const;

interface AppHeaderProps {
  activeSection?: string;
}

export function AppHeader({ activeSection }: AppHeaderProps) {
  const navigate = useNavigate();
  const { data: settings } = useSettings();

  return (
    <div className="layer-header relative min-w-0 pb-2">
      <TopBar />

      <nav data-controller-scope="navigation" data-controller-section-nav aria-label="Biblioteca" className="flex items-center gap-2.5 overflow-x-auto px-[var(--shell-gutter)] pb-2 pt-2">
        {BUILT_IN_ITEMS.map((item) => (
          <NavPill
            key={item.key}
            label={translate(settings?.locale, item.labelKey as TranslationKey)}
            icon={item.icon}
            activeColorClass={item.colorClass}
            active={activeSection === item.key}
            onClick={() => navigate(`/biblioteca/${item.key}`)}
          />
        ))}

        {settings?.customCategories.map((category) => (
          <NavPill
            key={category.id}
            label={category.label}
            icon={category.icon}
            activeColorClass=""
            activeColorHex={category.colorHex}
            active={activeSection === category.id}
            onClick={() => navigate(`/biblioteca/${category.id}`)}
          />
        ))}

        <NavPill
          label={translate(settings?.locale, 'music')}
          icon={Music2}
          activeColorClass="bg-emerald-600"
          active={activeSection === 'musica'}
          onClick={() => navigate('/musica')}
        />

        <NavPill
          label={translate(settings?.locale, 'calendar')}
          icon={Calendar}
          activeColorClass="bg-violet-600"
          active={activeSection === 'calendario'}
          onClick={() => navigate('/calendario')}
        />

        <button
          onClick={() => navigate('/sesion')}
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-[11px] border border-noche-border bg-noche-surface px-4 py-2 text-sm font-semibold text-noche-text transition duration-150 hover:border-[rgb(var(--theme-accent))] hover:text-[rgb(var(--theme-accent))] active:scale-[.98]"
        >
          <Shuffle size={16} strokeWidth={2.5} />
          {translate(settings?.locale, 'destination')}
        </button>
      </nav>
    </div>
  );
}
