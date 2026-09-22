import { useState } from 'react';
import type { GameInstallationSummary, GameStore } from '@proyecto-noche/domain';
import { Gamepad2 } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Overlay';

const LABEL: Record<GameStore, string> = { steam:'Steam',epic:'Epic Games',gog:'GOG',xbox:'Xbox',ea:'EA',ubisoft:'Ubisoft',battlenet:'Battle.net',manual:'Manual' };

export function GameInstallationChooser({ installations, busy, onChoose, onClose }: { installations: GameInstallationSummary[]; busy: boolean; onChoose: (id: string, remember: boolean) => void; onClose: () => void }) {
  const [remember, setRemember] = useState(true);
  return <Modal labelledBy="game-installation-title" className="grid place-items-center bg-black/70 p-4" onClose={onClose}>
    <div className="w-full max-w-md rounded-2xl border border-noche-border bg-noche-surface p-6 shadow-2xl"><Gamepad2 className="text-[rgb(var(--theme-accent))]" /><h2 id="game-installation-title" className="mt-3 text-xl font-semibold text-noche-text">¿Desde dónde quieres jugar?</h2><div className="mt-5 space-y-2">{installations.map((installation) => <button key={installation.installationId} disabled={busy} onClick={() => onChoose(installation.installationId, remember)} className="flex w-full items-center justify-between rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-left text-sm text-noche-text hover:border-[rgb(var(--theme-accent))]"><span>{LABEL[installation.store]}</span><span className="text-xs text-noche-muted">Abrir</span></button>)}</div><label className="mt-4 flex items-center gap-2 text-sm text-noche-muted"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Recordar en este equipo</label><div className="mt-5 flex justify-end"><Button variant="ghost" onClick={onClose}>Cancelar</Button></div></div>
  </Modal>;
}
