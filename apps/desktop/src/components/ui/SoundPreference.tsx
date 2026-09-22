import { useEffect } from 'react';
import { useSettings } from '../../hooks/use-settings';
import { soundManager } from '../../lib/sound-manager';
import type { SoundEvent } from '@proyecto-noche/domain';
import { useUiStore } from '../../stores/ui-store';

export function SoundPreference() {
  const { data: settings } = useSettings();
  const entryState = useUiStore((state) => state.entryState);
  useEffect(() => { if (settings) soundManager.configure(settings.audioSettings); }, [settings]);
  useEffect(() => {
    const unlock = () => { void soundManager.unlock(); if (entryState === 'title') soundManager.startAmbience(); };
    const sound = (event: Event) => soundManager.play((event as CustomEvent<SoundEvent>).detail);
    const pointerConfirm = (event: PointerEvent) => { document.documentElement.dataset.inputSource = 'pointer'; if (event.button === 0 && (event.target as HTMLElement).closest('button,a[href]')) soundManager.play('confirm'); };
    const keyboardSource = (event: KeyboardEvent) => { if (event.isTrusted) document.documentElement.dataset.inputSource = 'keyboard'; };
    const focusMove = (event: FocusEvent) => { if (document.documentElement.dataset.inputSource === 'controller' && (event.target as HTMLElement).matches('button,a[href]')) soundManager.play('move'); };
    const error = () => soundManager.play('error');
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('app-sound', sound);
    window.addEventListener('pointerdown', pointerConfirm);
    window.addEventListener('keydown', keyboardSource);
    window.addEventListener('focusin', focusMove);
    window.addEventListener('app-error', error);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); window.removeEventListener('app-sound', sound); window.removeEventListener('pointerdown', pointerConfirm); window.removeEventListener('keydown', keyboardSource); window.removeEventListener('focusin', focusMove); window.removeEventListener('app-error', error); };
  }, [entryState]);
  useEffect(() => { if (entryState === 'title') soundManager.startAmbience(); else soundManager.stopAmbience(); }, [entryState]);
  return null;
}
