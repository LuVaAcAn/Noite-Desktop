import { useLocation, useNavigate } from 'react-router-dom';
import { Gamepad2, Search } from 'lucide-react';
import { useGameScanStatus, useSkipGameScan } from '../../hooks/use-game-discovery';
import { useSettings } from '../../hooks/use-settings';
import { Button } from './Button';
import { Modal } from './Overlay';
import { useUiStore } from '../../stores/ui-store';

export function GameDiscoveryManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettings();
  const entryState = useUiStore((state) => state.entryState);
  const status = useGameScanStatus();
  const skip = useSkipGameScan();
  if (!('__TAURI_INTERNALS__' in window) || entryState !== 'app' || !settings.data?.onboardingComplete || location.pathname === '/bienvenida' || location.pathname === '/juegos/instalados') return null;

  if (status.data?.status === 'pending_review') return <button onClick={() => navigate('/juegos/instalados')} className="fixed bottom-20 right-5 z-40 flex items-center gap-2 rounded-full border border-purple-300/30 bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl"><Search size={16} />Revisar juegos encontrados</button>;
  if (status.data?.status !== 'not_asked') return null;

  return <Modal labelledBy="game-scan-intro-title" className="grid place-items-center bg-black/75 p-4" onClose={() => undefined}>
    <div className="w-full max-w-lg rounded-[26px] border border-noche-border bg-noche-surface p-7 shadow-2xl">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-purple-500/10 text-purple-700"><Gamepad2 size={28} /></span>
      <h2 id="game-scan-intro-title" className="mt-5 font-display text-2xl font-bold text-noche-text">¿Buscamos tus juegos instalados?</h2>
      <p className="mt-3 text-sm leading-6 text-noche-muted">Noite puede revisar los inventarios locales de Steam, Epic, GOG, Xbox, EA, Ubisoft y Battle.net. No recorrerá todo el disco ni subirá rutas o datos de instalación.</p>
      <p className="mt-3 text-sm leading-6 text-noche-muted">Antes de añadir algo a la biblioteca podrás revisar, combinar o ignorar cada hallazgo.</p>
      <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" disabled={skip.isPending} onClick={() => skip.mutate()}>Omitir</Button><Button onClick={() => navigate('/juegos/instalados')}>Escanear ahora</Button></div>
    </div>
  </Modal>;
}
