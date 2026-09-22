import { motion, useReducedMotion } from 'motion/react';
import { useSettings } from '../../hooks/use-settings';

const isotipoUrl = new URL('../../../../../assets/isotipo.png', import.meta.url).href;

export function AnimatedIsotipo({ className = 'h-16 w-16' }: { className?: string }) {
  const systemReduced = useReducedMotion();
  const { data: settings } = useSettings();
  const reduced = systemReduced || settings?.motionMode === 'reduced';
  return <motion.img
    src={isotipoUrl}
    alt=""
    draggable={false}
    className={`${className} select-none object-contain drop-shadow-[0_0_18px_rgba(236,72,153,.35)]`}
    animate={reduced ? undefined : { y: [-3, 3, -3], rotate: [-2, 2, -2], scale: [1, 1.025, 1] }}
    transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
  />;
}
