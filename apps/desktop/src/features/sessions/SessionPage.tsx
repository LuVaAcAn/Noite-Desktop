import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LibraryItem } from '@proyecto-noche/domain';
import { Shuffle } from 'lucide-react';
import { AppShell } from '../../components/ui/AppShell';
import { ArcadeLottie } from '../../components/ui/ArcadeLottie';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../../components/ui/Button';
import { useLibraryList } from '../../hooks/use-library';

// Corresponde a FR-SESSION-003 "Botón del destino" (sección 6.9): elegir al
// azar entre lo pendiente cuando ninguno de los dos logra decidirse. La
// versión completa de "sesión activa" (temporizador compartido, notas en
// vivo) es Fase 3 del roadmap; esto ya resuelve el caso de uso principal.
export function SessionPage() {
  const navigate = useNavigate();
  const { data } = useLibraryList({ status: 'pending', pageSize: 500 });
  const [picked, setPicked] = useState<LibraryItem | null>(null);
  const [spinning, setSpinning] = useState(false);

  function spin() {
    if (!data || data.items.length === 0) return;
    window.dispatchEvent(new CustomEvent('app-sound', { detail: 'random' }));
    setSpinning(true);
    setPicked(null);
    let ticks = 0;
    const interval = setInterval(() => {
      const random = data.items[Math.floor(Math.random() * data.items.length)];
       setPicked(random);
      ticks += 1;
      if (ticks > 14) {
        clearInterval(interval);
        setSpinning(false);
      }
    }, 90);
  }

  return (
    <AppShell showBack>
      <main className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-[var(--shell-gutter)] pt-[var(--content-pad-y)] pb-[var(--floating-controls-clearance)] text-center">
        <h1 className="font-display text-2xl font-bold text-noche-text">¿No saben qué elegir?</h1>
        <p className="mt-2 max-w-md text-sm text-noche-muted">
          El botón del destino elige al azar entre lo que tienen pendiente.
        </p>

        <motion.div animate={spinning ? { rotate: [0, -3, 3, -2, 2, 0], scale: [1, 1.04, 0.98, 1.03, 1] } : { rotate: 0, scale: 1 }} transition={{ repeat: spinning ? Infinity : 0, duration: 0.5 }} className="relative mt-7 flex h-52 w-52 items-center justify-center overflow-hidden rounded-3xl border border-noche-border bg-noche-surface p-6 shadow-card">
          <AnimatePresence>{picked && !spinning && <motion.div initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0"><ArcadeLottie variant="random" className="h-full w-full" loop={false} /></motion.div>}</AnimatePresence>
          <p className="relative z-10 font-display text-xl font-bold text-noche-text">
            {picked?.title ?? (data?.items.length ? '¿Listos?' : 'Agrega pendientes primero')}
          </p>
        </motion.div>

        <Button className="mt-8" onClick={spin} disabled={spinning || !data?.items.length}>
          <Shuffle size={16} /> {spinning ? 'Eligiendo…' : 'Girar'}
        </Button>
        {picked && !spinning && (
          <div className="mt-4 flex gap-3">
            <Button variant="ghost" onClick={() => navigate(`/biblioteca/item/${picked.id}`)}>Abrir</Button>
            <Button variant="secondary" onClick={() => navigate(`/calendario?item=${picked.id}`)}>Planear esto</Button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
