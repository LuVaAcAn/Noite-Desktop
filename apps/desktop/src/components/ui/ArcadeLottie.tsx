import { useEffect, useRef } from 'react';
import lottie from 'lottie-web/build/player/lottie_light';
import { useReducedMotion } from 'motion/react';
import { useSettings } from '../../hooks/use-settings';

export type ArcadeAnimation = 'burst' | 'loading' | 'success' | 'random' | 'spotify' | 'controller' | 'gallery';
const loaders = {
  burst: () => import('../../assets/animations/arcade-burst.json'),
  loading: () => import('../../assets/animations/loading-orbit.json'),
  success: () => import('../../assets/animations/success-pulse.json'),
  random: () => import('../../assets/animations/random-reel.json'),
  spotify: () => import('../../assets/animations/spotify-link.json'),
  controller: () => import('../../assets/animations/controller-connect.json'),
  gallery: () => import('../../assets/animations/gallery-spark.json'),
} satisfies Record<ArcadeAnimation, () => Promise<{ default: object }>>;

export function ArcadeLottie({ className = 'h-28 w-28', loop = true, variant = 'burst' }: { className?: string; loop?: boolean; variant?: ArcadeAnimation }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const systemReduced = useReducedMotion();
  const { data: settings } = useSettings();
  const reduced = systemReduced || settings?.motionMode === 'reduced';
  useEffect(() => {
    if (reduced || !containerRef.current) return;
    let cancelled = false;
    let animation: ReturnType<typeof lottie.loadAnimation> | null = null;
    void loaders[variant]().then(({ default: animationData }) => {
      if (cancelled || !containerRef.current) return;
      animation = lottie.loadAnimation({ container: containerRef.current, renderer: 'svg', loop, autoplay: true, animationData: structuredClone(animationData), rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true } });
    });
    return () => { cancelled = true; animation?.destroy(); };
  }, [loop, reduced, variant]);
  if (reduced) {
    return <svg aria-hidden="true" viewBox="0 0 100 100" className={className}><circle cx="50" cy="50" r="31" fill="none" stroke="currentColor" strokeWidth="7" opacity=".32" /><circle cx="50" cy="50" r="9" fill="currentColor" opacity=".7" /></svg>;
  }
  return <div ref={containerRef} aria-hidden="true" className={className} />;
}
