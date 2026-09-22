import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { lockAllPasswordVaults } from '../../lib/native-password-vault';

const IDLE_MS = 10 * 60 * 1000;

export function VaultSessionGuard() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let idleTimer = 0;
    let unlisten: (() => void) | undefined;
    const lock = async () => {
      await lockAllPasswordVaults().catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: ['password-vault'] });
    };
    const resetIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => void lock(), IDLE_MS);
    };
    const activityEvents: (keyof WindowEventMap)[] = ['pointerdown', 'keydown'];
    activityEvents.forEach((event) => window.addEventListener(event, resetIdle, { passive: true }));
    resetIdle();
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().onFocusChanged(({ payload }) => {
      if (!payload) void lock();
      else resetIdle();
    })).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => {
      window.clearTimeout(idleTimer);
      activityEvents.forEach((event) => window.removeEventListener(event, resetIdle));
      unlisten?.();
    };
  }, [queryClient]);
  return null;
}
