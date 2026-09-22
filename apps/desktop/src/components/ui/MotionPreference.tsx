import { useEffect } from 'react';
import { useSettings } from '../../hooks/use-settings';

export function MotionPreference() {
  const { data: settings } = useSettings();
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { document.documentElement.dataset.motion = media.matches || settings?.motionMode === 'reduced' ? 'reduced' : settings?.motionMode === 'full' ? 'full' : 'system'; };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [settings?.motionMode]);
  return null;
}
