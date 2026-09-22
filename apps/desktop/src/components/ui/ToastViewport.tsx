import { useEffect, useRef, useState } from 'react';

interface Toast { id: number; message: string; tone: 'error' | 'info'; createdAt: number }

export function ToastViewport() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  useEffect(() => {
    function onToast(event: Event) {
      const message = (event as CustomEvent<string>).detail;
      const createdAt = Date.now();
      const id = ++nextId.current;
      setToasts((current) => current.some((toast) => toast.message === message && createdAt - toast.createdAt < 3_000)
        ? current
        : [...current, { id, message, tone: event.type === 'app-error' ? 'error' : 'info', createdAt }]);
      window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 6_000);
    }
    window.addEventListener('app-error', onToast);
    window.addEventListener('app-toast', onToast);
    return () => { window.removeEventListener('app-error', onToast); window.removeEventListener('app-toast', onToast); };
  }, []);
  return <div aria-live="polite" className="layer-toast fixed bottom-12 right-24 space-y-2">{toasts.map((toast) => <div key={toast.id} className={`max-w-sm rounded-md px-4 py-3 text-sm text-white shadow-2xl ${toast.tone === 'error' ? 'bg-red-700' : 'bg-zinc-900'}`}>{toast.message}</div>)}</div>;
}
