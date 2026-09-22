import { useEffect } from 'react';
import { Gamepad2, RotateCcw, Vibrate, X } from 'lucide-react';
import { DEFAULT_CONTROLLER_MAPPING, type ControllerAction, type LocalSettings } from '@proyecto-noche/domain';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Overlay';
import { useGamepads } from '../../hooks/use-gamepads';
import { useUpdateSettings } from '../../hooks/use-settings';
import { normalizeAxis } from '../../lib/controller-utils';
import { ArcadeLottie } from '../../components/ui/ArcadeLottie';

const ACTION_LABELS: Record<ControllerAction, string> = {
  confirm: 'Confirmar', back: 'Atrás', menu: 'Comandos', up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha', previousSection: 'Sección anterior', nextSection: 'Sección siguiente',
};

export function ControllerSettingsPanel({ settings }: { settings: LocalSettings }) {
  const gamepads = useGamepads();
  const updateSettings = useUpdateSettings();
  const closeTest = () => { gamepads.setTesting(false); gamepads.setDiagnosticsEnabled(false); };
  const { setDiagnosticsEnabled, setTesting } = gamepads;
  useEffect(() => () => { setTesting(false); setDiagnosticsEnabled(false); }, [setDiagnosticsEnabled, setTesting]);

  return <>
    <section className="rounded-2xl border border-noche-border bg-noche-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">{gamepads.snapshots.length > 0 && <ArcadeLottie variant="controller" loop={false} className="h-12 w-12 text-cyan-400" />}<div><h2 className="flex items-center gap-2 font-semibold text-noche-text"><Gamepad2 size={19} /> Controles</h2><p className="mt-1 text-sm text-noche-muted">{gamepads.snapshots.length > 0 ? `${gamepads.snapshots.length} control${gamepads.snapshots.length === 1 ? '' : 'es'} conectado${gamepads.snapshots.length === 1 ? '' : 's'}.` : 'No hay controles conectados.'}</p></div></div>
        <label className="flex items-center gap-2 text-sm font-medium text-noche-text"><input type="checkbox" checked={settings.controllerNavigationEnabled} onChange={(event) => updateSettings.mutate({ controllerNavigationEnabled: event.target.checked })} /> Navegar con control</label>
      </div>
      {!gamepads.supported && <p role="alert" className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">Este WebView no expone la API de controles.</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-noche-border bg-noche-bg p-4"><div><p className="text-sm font-semibold text-noche-text">Diagnóstico aislado</p><p className="mt-1 text-xs text-noche-muted">Prueba botones, sticks y vibración sin activar ni navegar por la app.</p></div><Button disabled={!gamepads.supported} onClick={() => { gamepads.cancelCapture(); gamepads.setDiagnosticsEnabled(true); gamepads.setTesting(true); }}><Gamepad2 size={16} /> Probar control</Button></div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[220px_1fr]">
        <label className="text-sm font-medium text-noche-text">Zona muerta: {settings.controllerDeadZone.toFixed(2)}<input className="mt-2 w-full accent-[rgb(var(--theme-accent))]" type="range" min="0.15" max="0.9" step="0.05" value={settings.controllerDeadZone} onChange={(event) => updateSettings.mutate({ controllerDeadZone: Number(event.target.value) })} /></label>
        <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-noche-text">Asignaciones</h3><button className="flex items-center gap-1 text-xs text-noche-muted underline" onClick={() => updateSettings.mutate({ controllerMapping: DEFAULT_CONTROLLER_MAPPING })}><RotateCcw size={12} /> Restablecer</button></div><div className="grid gap-2 sm:grid-cols-2">{(Object.keys(ACTION_LABELS) as ControllerAction[]).map((action) => <button key={action} onClick={() => gamepads.captureAction === action ? gamepads.cancelCapture() : gamepads.beginCapture(action)} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs ${gamepads.captureAction === action ? 'border-[rgb(var(--theme-accent))] bg-[rgb(var(--theme-accent)/.12)]' : 'border-noche-border bg-noche-bg'}`}><span>{ACTION_LABELS[action]}</span><span className="font-semibold">{gamepads.captureAction === action ? 'Presiona…' : `B${settings.controllerMapping[action]?.index ?? '?'}`}</span></button>)}</div></div>
      </div>
    </section>

    {gamepads.testing && <Modal labelledBy="controller-test-title" closeOnBackdrop={false} closeOnEscape={false} onClose={closeTest} className="grid place-items-center overflow-y-auto bg-black/85 p-4">
      <section className="w-full max-w-4xl rounded-2xl border border-noche-border bg-noche-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[rgb(var(--theme-accent))]">Modo de prueba</p><h2 id="controller-test-title" className="mt-1 text-xl font-semibold text-noche-text">Probar control</h2><p className="mt-1 text-sm text-noche-muted">Los controles de la aplicación están bloqueados. Cierra con Atrás/B/Círculo o haciendo clic en la X.</p></div><button data-dialog-close aria-label="Cerrar prueba de control" onPointerUp={closeTest} className="rounded-full border border-noche-border p-2 text-noche-muted hover:bg-noche-bg hover:text-noche-text"><X size={19} /></button></div>
        {gamepads.snapshots.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-noche-border p-10 text-center text-sm text-noche-muted"><Gamepad2 className="mx-auto mb-2" />Esperando un control…</div>}
        <div className="mt-5 max-h-[65dvh] space-y-4 overflow-y-auto pr-1">{gamepads.snapshots.map((pad) => <article key={pad.index} className={`rounded-2xl border p-4 ${pad.index === gamepads.activeIndex ? 'border-[rgb(var(--theme-accent))] bg-[rgb(var(--theme-accent)/.08)]' : 'border-noche-border bg-noche-bg'}`}><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-noche-text">{pad.id}</h3><p className="text-xs text-noche-muted">Control {pad.index + 1} · {pad.mapping || 'mapeo genérico'} · {pad.index === gamepads.activeIndex ? 'activo' : 'conectado'} · zona muerta {settings.controllerDeadZone.toFixed(2)}</p></div><Button size="sm" variant="ghost" disabled={!pad.hapticsSupported} onClick={() => void gamepads.vibrate(pad.index)}><Vibrate size={15} /> {pad.hapticsSupported ? 'Vibrar' : 'Sin vibración'}</Button></div><div className="mt-4 grid grid-cols-8 gap-1.5" aria-label="Botones del control">{pad.buttons.map((button, index) => <div key={index} title={`Botón ${index}: ${button.value.toFixed(2)}`} className={`flex aspect-square items-center justify-center rounded-lg text-[10px] font-bold transition ${button.pressed ? 'scale-110 bg-[rgb(var(--theme-accent))] text-white shadow-lg' : 'bg-noche-surface text-noche-muted'}`}>{index}</div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{pad.axes.map((axis, index) => { const normalized = normalizeAxis(axis, settings.controllerDeadZone); return <div key={index}><div className="mb-1 flex justify-between text-[10px] text-noche-muted"><span>Eje {index}</span><span>crudo {axis.toFixed(2)} · normal {normalized.toFixed(2)}</span></div><div className="relative h-2 overflow-hidden rounded-full bg-noche-surface"><span className="absolute left-1/2 top-0 h-full w-1 bg-noche-border" /><span className="absolute top-0 h-full rounded-full bg-[rgb(var(--theme-accent))]" style={{ left: `${Math.min(50, 50 + normalized * 50)}%`, width: `${Math.abs(normalized) * 50}%` }} /></div></div>; })}</div></article>)}</div>
      </section>
    </Modal>}
  </>;
}
