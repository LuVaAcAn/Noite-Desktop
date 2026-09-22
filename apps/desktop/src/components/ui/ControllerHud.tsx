import { Gamepad2 } from 'lucide-react';
import { useGamepads } from '../../hooks/use-gamepads';
import { useLocation } from 'react-router-dom';
import type { ControllerHint } from '@proyecto-noche/domain';

const Hint = ({ button, label }: { button: string; label: string }) => <span className="flex items-center gap-1.5"><kbd className="flex min-w-5 items-center justify-center rounded-[6px] border border-noche-border bg-noche-bg/70 px-1 py-0.5 font-mono text-[9px] text-noche-text">{button}</kbd>{label}</span>;

export function ControllerHud({ titleScreen = false }: { titleScreen?: boolean }) {
  const location = useLocation();
  const { snapshots, activeIndex } = useGamepads();
  if (snapshots.length === 0) return null;
  const active = snapshots.find((controller) => controller.index === activeIndex) ?? snapshots[0];
  const contextual: ControllerHint[] = location.pathname === '/galeria' ? [{ button: '✚', label: 'Explorar' }, { button: 'A', label: 'Ampliar' }, { button: 'B', label: 'Cerrar' }] : location.pathname === '/musica' ? [{ button: '✚', label: 'Mover' }, { button: 'A', label: 'Abrir' }, { button: 'B', label: 'Atrás' }] : location.pathname === '/calendario' ? [{ button: '✚', label: 'Mover' }, { button: 'A', label: 'Editar' }, { button: 'B', label: 'Atrás' }] : [{ button: '✚', label: 'Mover' }, { button: 'A', label: 'Elegir' }, { button: 'B', label: 'Atrás' }];
  return <footer className={`noite-controller-hud layer-chrome relative flex h-8 items-center justify-between border-t px-[var(--shell-gutter)] text-[10px] font-semibold uppercase tracking-wide backdrop-blur-xl ${titleScreen ? 'border-noche-border bg-noche-surface text-noche-muted' : 'border-noche-border/80 bg-noche-surface/85 text-noche-muted'}`}>
    <div className="flex min-w-0 items-center gap-2 text-[rgb(var(--theme-accent))]"><Gamepad2 size={15} /><span className="max-w-56 truncate">{active.id}</span><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span>conectado</span></div>
    <div className="flex min-w-0 items-center gap-4 overflow-x-auto">{contextual.map((hint) => <Hint key={hint.button} {...hint} />)}<Hint button="LB/RB" label="Sección" /><Hint button="☰" label="Comandos" /></div>
  </footer>;
}
