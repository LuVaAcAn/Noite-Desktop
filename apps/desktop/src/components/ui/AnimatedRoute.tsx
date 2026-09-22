import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useSettings } from '../../hooks/use-settings';

export function AnimatedRoute({ children }: { children: ReactNode }) {
  const reducedBySystem = useReducedMotion();
  const { data: settings } = useSettings();
  const reduced = reducedBySystem || settings?.motionMode === 'reduced';
  return <motion.div data-controller-scope="content" className="relative z-0 h-full min-h-0 min-w-0 overflow-hidden" initial={reduced ? false : { opacity: 0.96, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}
