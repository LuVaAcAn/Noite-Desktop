import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Gamepad2, Home, Images, Library, Music2, Plus, Search, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COMMANDS = [
  { label: 'Inicio', path: '/', icon: Home, keywords: 'home' },
  { label: 'Buscar en la biblioteca', path: '/buscar?q=', icon: Search, keywords: 'search biblioteca' },
  { label: 'Nueva actividad', path: '/actividades/nueva', icon: Plus, keywords: 'crear registrar' },
  { label: 'Juegos', path: '/biblioteca/juegos', icon: Library, keywords: 'biblioteca games' },
  { label: 'Planes', path: '/calendario', icon: CalendarDays, keywords: 'calendario' },
  { label: 'Música', path: '/musica', icon: Music2, keywords: 'spotify canciones' },
  { label: 'Galería', path: '/galeria', icon: Images, keywords: 'fotos capturas memorias' },
  { label: 'Probar control', path: '/settings?section=controllers', icon: Gamepad2, keywords: 'gamepad mando joystick' },
  { label: 'Ajustes', path: '/settings', icon: Settings, keywords: 'configuración' },
  { label: 'Volver', path: '__back__', icon: ArrowLeft, keywords: 'atrás back' },
] as const;

export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [controllerOpen, setControllerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const toggle = (event: Event) => { setControllerOpen((event as CustomEvent<{ source?: string }>).detail?.source === 'controller'); setOpen((value) => !value); };
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setControllerOpen(false);
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('app-command-palette', toggle);
    document.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('app-command-palette', toggle);
      document.removeEventListener('keydown', keyboard);
    };
  }, []);
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.setTimeout(() => {
      if (controllerOpen) document.querySelector<HTMLElement>('[data-command-item]')?.focus();
      else inputRef.current?.focus();
      }, 0);
    } else {
      setQuery('');
      previousFocusRef.current?.focus({ preventScroll: true });
    }
  }, [controllerOpen, open]);
  useEffect(() => {
    if (!open) return;
    const shell = document.querySelector<HTMLElement>('[data-noite-shell]');
    const previousInert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
    document.addEventListener('keydown', trapFocus, true);
    return () => {
      document.removeEventListener('keydown', trapFocus, true);
      if (shell) shell.inert = previousInert;
    };
  }, [open]);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? COMMANDS.filter((command) => `${command.label} ${command.keywords}`.toLowerCase().includes(term)) : COMMANDS;
  }, [query]);
  if (!open) return null;
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Comandos rápidos" className="layer-command fixed inset-0 flex items-start justify-center bg-black/55 p-6 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/50 bg-noche-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-noche-border px-5">
          <Search size={18} className="text-pink-500" />
          <input ref={inputRef} disabled={controllerOpen} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={controllerOpen ? 'Elige un comando' : 'Ir a…'} className="h-14 flex-1 bg-transparent text-noche-text outline-none placeholder:text-noche-muted disabled:cursor-default" />
          <kbd className="rounded-md bg-noche-bg px-2 py-1 text-xs text-noche-muted">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto overscroll-contain p-2">
          {results.map((command) => {
            const Icon = command.icon;
            return <li key={command.path}><button data-command-item className="arcade-focus flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-sm font-medium text-noche-text transition hover:bg-[rgb(var(--theme-accent)/.12)] focus:bg-[rgb(var(--theme-accent)/.12)]" onClick={() => { setOpen(false); if (command.path === '__back__') navigate(-1); else navigate(command.path); }}><span className="flex h-9 w-9 items-center justify-center rounded-md bg-noche-bg text-[rgb(var(--theme-accent))]"><Icon size={18} /></span>{command.label}</button></li>;
          })}
          {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-noche-muted">No hay comandos que coincidan.</li>}
        </ul>
      </div>
    </div>
  );
}
