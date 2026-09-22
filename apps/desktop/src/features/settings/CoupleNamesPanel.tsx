import { useState } from 'react';
import type { LocalSettings } from '@proyecto-noche/domain';
import { Button } from '../../components/ui/Button';

export function CoupleNamesPanel({ settings, onSave }: { settings: LocalSettings; onSave: (names: { userName: string; partnerName: string }) => Promise<unknown> }) {
  const [first, setFirst] = useState(settings.userName);
  const [second, setSecond] = useState(settings.partnerName);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const valid = first.trim().length > 0 && second.trim().length > 0 && first.trim().toLocaleLowerCase() !== second.trim().toLocaleLowerCase();
  return <form className="mt-5 space-y-3 rounded-xl border border-noche-border bg-noche-bg p-4" onSubmit={async (event) => {
    event.preventDefault();
    if (!valid || !confirmed || busy) return;
    setBusy(true); setMessage('');
    try { await onSave({ userName: first.trim(), partnerName: second.trim() }); setConfirmed(false); setMessage('Nombres de la pareja guardados. Ya pueden elegir de quién fue la idea.'); }
    catch { setMessage('No se pudieron guardar los nombres. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }}>
    <h3 className="font-semibold text-noche-text">Nombres de la pareja</h3>
    <p className="text-sm text-noche-muted">Mantengan el mismo orden al compartir respaldos. Cambiar los nombres no cambia la atribución de ideas ya guardadas ni las contraseñas de acceso.</p>
    <label className="block text-sm text-noche-muted">Primera persona<input aria-label="Primera persona" disabled={busy} maxLength={80} value={first} onChange={(e) => { setFirst(e.target.value); setConfirmed(false); }} className="mt-1 w-full rounded-xl border border-noche-border bg-noche-surface p-2 text-noche-text" /></label>
    <label className="block text-sm text-noche-muted">Segunda persona<input aria-label="Segunda persona" disabled={busy} maxLength={80} value={second} onChange={(e) => { setSecond(e.target.value); setConfirmed(false); }} className="mt-1 w-full rounded-xl border border-noche-border bg-noche-surface p-2 text-noche-text" /></label>
    {!valid && <p className="text-sm text-noche-muted">Escriban dos nombres distintos; pueden usar apodos para distinguirse.</p>}
    <label className="flex gap-2 text-sm text-noche-text"><input type="checkbox" disabled={!valid || busy} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />Confirmo los nombres: {first.trim() || '…'} y {second.trim() || '…'}.</label>
    <Button type="submit" disabled={!valid || !confirmed || busy}>{busy ? 'Guardando…' : 'Guardar nombres de pareja'}</Button>
    {message && <p role="status" className="text-sm text-noche-text">{message}</p>}
  </form>;
}
