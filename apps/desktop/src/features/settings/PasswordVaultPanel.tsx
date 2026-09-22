import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, ExternalLink, KeyRound, Lock, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import type { PasswordVaultEntry, PasswordVaultEntryInput, VaultProfileSlot } from '@proyecto-noche/domain';
import { Button } from '../../components/ui/Button';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { usePasswordVaultActions, usePasswordVaultEntries, usePasswordVaultStatus } from '../../hooks/use-password-vault';
import { passwordVaultRepository } from '../../lib/native-password-vault';
import { openExternal } from '../../lib/system-status';
import { ModalPortal } from '../../components/ui/Overlay';

const EMPTY_ENTRY: PasswordVaultEntryInput = { site: '', url: '', username: '', password: '', notes: '' };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

export function PasswordVaultPanel({ actorId, actorName, avatarUrl }: { actorId: VaultProfileSlot; actorName: string; avatarUrl?: string | null }) {
  const status = usePasswordVaultStatus(actorId);
  const actions = usePasswordVaultActions(actorId);
  const entries = usePasswordVaultEntries(actorId, Boolean(status.data?.unlocked));
  const [master, setMaster] = useState('');
  const [masterConfirm, setMasterConfirm] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<PasswordVaultEntryInput | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const revealTimers = useRef<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [changeMaster, setChangeMaster] = useState<{ current: string; next: string; confirm: string } | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState<string | null>(null);

  useEffect(() => {
    setMaster('');
    setMasterConfirm('');
    setSearch('');
    setEditing(null);
    setRevealed({});
    setLocalError(null);
    setMessage(null);
  }, [actorId]);

  useEffect(() => () => Object.values(revealTimers.current).forEach(window.clearTimeout), []);

  useEffect(() => {
    if (status.data?.unlocked) return;
    Object.values(revealTimers.current).forEach(window.clearTimeout);
    revealTimers.current = {};
    setRevealed({});
    setEditing(null);
    setChangeMaster(null);
    setMaster('');
    setMasterConfirm('');
  }, [status.data?.unlocked]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    if (!query) return entries.data ?? [];
    return (entries.data ?? []).filter((entry) => [entry.site, entry.url, entry.username, entry.notes].some((value) => value.toLocaleLowerCase('es').includes(query)));
  }, [entries.data, search]);

  async function initialize() {
    setLocalError(null);
    if (master.length < 12) return setLocalError('La contraseña maestra debe tener al menos 12 caracteres.');
    if (master !== masterConfirm) return setLocalError('Las contraseñas maestras no coinciden.');
    try {
      await actions.initialize.mutateAsync(master);
      setMaster(''); setMasterConfirm('');
      setMessage('Almacén cifrado creado para este perfil.');
    } catch (error) { setLocalError(errorMessage(error)); }
  }

  async function unlock() {
    setLocalError(null);
    try {
      await actions.unlock.mutateAsync(master);
      setMaster('');
      setMessage('Almacén desbloqueado. Se bloqueará al cambiar de perfil, minimizar o tras 10 minutos sin actividad.');
    } catch (error) { setLocalError(errorMessage(error)); }
  }

  async function reveal(entry: PasswordVaultEntry) {
    if (revealed[entry.id]) {
      window.clearTimeout(revealTimers.current[entry.id]);
      setRevealed((current) => { const next = { ...current }; delete next[entry.id]; return next; });
      return;
    }
    try {
      const password = await passwordVaultRepository.reveal(actorId, entry.id);
      setRevealed((current) => ({ ...current, [entry.id]: password }));
      revealTimers.current[entry.id] = window.setTimeout(() => setRevealed((current) => { const next = { ...current }; delete next[entry.id]; return next; }), 30_000);
    } catch (error) { setLocalError(errorMessage(error)); }
  }

  async function edit(entry: PasswordVaultEntry) {
    setLocalError(null);
    try {
      const password = await passwordVaultRepository.reveal(actorId, entry.id);
      setEditing({ id: entry.id, site: entry.site, url: entry.url, username: entry.username, password, notes: entry.notes });
    } catch (error) { setLocalError(errorMessage(error)); }
  }

  async function saveEntry(input: PasswordVaultEntryInput) {
    setLocalError(null);
    try {
      await actions.upsert.mutateAsync(input);
      setEditing(null);
      setMessage(input.id ? 'Entrada actualizada.' : 'Contraseña guardada.');
    } catch (error) { setLocalError(errorMessage(error)); }
  }

  async function copy(entry: PasswordVaultEntry) {
    try {
      await passwordVaultRepository.copySecret(actorId, entry.id);
      setMessage('Contraseña copiada. El portapapeles se limpiará en 30 segundos si no lo cambias.');
    } catch (error) { setLocalError(errorMessage(error)); }
  }

  async function remove(entry: PasswordVaultEntry) {
    if (!window.confirm(`¿Eliminar la contraseña de “${entry.site}”? Esta acción no se puede deshacer fuera de los respaldos cifrados.`)) return;
    try { await actions.remove.mutateAsync(entry.id); setMessage('Entrada eliminada.'); }
    catch (error) { setLocalError(errorMessage(error)); }
  }

  if (!('__TAURI_INTERNALS__' in window)) return <section className="rounded-[14px] border border-noche-border bg-noche-surface p-6"><h2 className="font-semibold text-noche-text">Contraseñas</h2><p className="mt-2 text-sm text-noche-muted">El almacén cifrado está disponible en la aplicación de escritorio de Noite.</p></section>;
  if (status.isLoading) return <p className="p-6 text-sm text-noche-muted">Comprobando el almacén cifrado…</p>;
  if (status.isError) return <section role="alert" className="rounded-[14px] border border-red-300 bg-red-50 p-5 text-sm text-red-700"><p>{errorMessage(status.error)}</p><Button className="mt-3" size="sm" onClick={() => status.refetch()}><RefreshCw size={14} /> Reintentar</Button></section>;

  const profileBadge = <div className="flex items-center gap-3"><ProfileAvatar name={actorName} src={avatarUrl} className="h-11 w-11" /><div><p className="text-xs font-semibold uppercase tracking-wide text-noche-muted">Almacén privado de</p><p className="font-semibold text-noche-text">{actorName}</p></div></div>;

  if (!status.data?.configured) return <section className="rounded-[14px] border border-noche-border bg-noche-surface p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">{profileBadge}<ShieldCheck className="text-emerald-500" /></div>
    <h2 className="mt-6 text-xl font-semibold text-noche-text">Crear almacén cifrado</h2>
    <p className="mt-2 text-sm leading-6 text-noche-muted">Esta contraseña maestra protege únicamente el perfil de {actorName}. Noite no puede recuperarla si la olvidas.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-sm text-noche-muted">Contraseña maestra<input type="password" autoComplete="new-password" value={master} onChange={(event) => setMaster(event.target.value)} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" /></label>
      <label className="text-sm text-noche-muted">Confirmar contraseña<input type="password" autoComplete="new-password" value={masterConfirm} onChange={(event) => setMasterConfirm(event.target.value)} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" /></label>
    </div>
    <p className="mt-2 text-xs text-noche-muted">Mínimo 12 caracteres. Una frase larga es más fácil de recordar y más resistente.</p>
    {localError && <p role="alert" className="mt-3 text-sm text-red-500">{localError}</p>}
    <Button className="mt-5" onClick={() => void initialize()} disabled={actions.initialize.isPending}><KeyRound size={16} /> {actions.initialize.isPending ? 'Cifrando…' : 'Crear almacén'}</Button>
  </section>;

  if (!status.data.unlocked) return <section className="rounded-[14px] border border-noche-border bg-noche-surface p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">{profileBadge}<Lock className="text-noche-muted" /></div>
    <h2 className="mt-6 text-xl font-semibold text-noche-text">Almacén bloqueado</h2>
    <p className="mt-2 text-sm text-noche-muted">Hay {status.data.entryCount} {status.data.entryCount === 1 ? 'entrada cifrada' : 'entradas cifradas'} para este perfil.</p>
    <form className="mt-5 max-w-md" onSubmit={(event) => { event.preventDefault(); void unlock(); }}><label className="text-sm text-noche-muted">Contraseña maestra<input autoFocus type="password" autoComplete="current-password" value={master} onChange={(event) => setMaster(event.target.value)} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-3 text-noche-text" /></label>{localError && <p role="alert" className="mt-3 text-sm text-red-500">{localError}</p>}<Button className="mt-4" type="submit" disabled={!master || actions.unlock.isPending}><KeyRound size={16} /> {actions.unlock.isPending ? 'Desbloqueando…' : 'Desbloquear'}</Button></form>
    <button className="mt-8 text-xs text-red-500 underline" onClick={() => setResetConfirmation('')}>Olvidé la contraseña maestra y quiero borrar este almacén</button>
    {resetConfirmation !== null && <ResetDialog value={resetConfirmation} onChange={setResetConfirmation} onClose={() => setResetConfirmation(null)} pending={actions.reset.isPending} onConfirm={async () => { try { await actions.reset.mutateAsync(resetConfirmation); setResetConfirmation(null); } catch (error) { setLocalError(errorMessage(error)); } }} />}
  </section>;

  return <section className="rounded-[14px] border border-noche-border bg-noche-surface p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">{profileBadge}<div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setChangeMaster({ current: '', next: '', confirm: '' })}>Cambiar maestra</Button><Button size="sm" variant="ghost" onClick={() => actions.lock.mutate()}><Lock size={14} /> Bloquear</Button></div></div>
    <div className="mt-6 flex flex-wrap items-center gap-3"><label className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-noche-muted" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sitio, usuario o nota" className="w-full rounded-xl border border-noche-border bg-noche-bg py-2.5 pl-10 pr-4 text-sm text-noche-text" /></label><Button size="sm" onClick={() => setEditing({ ...EMPTY_ENTRY })}><Plus size={15} /> Nueva contraseña</Button></div>
    {message && <p role="status" className="mt-3 text-sm text-emerald-600">{message}</p>}
    {localError && <p role="alert" className="mt-3 text-sm text-red-500">{localError}</p>}
    {entries.isLoading && <p className="mt-6 text-sm text-noche-muted">Descifrando entradas…</p>}
    {!entries.isLoading && filtered.length === 0 && <div className="mt-6 rounded-xl border border-dashed border-noche-border p-8 text-center"><KeyRound className="mx-auto text-noche-muted" /><p className="mt-3 font-medium text-noche-text">{search ? 'No hay coincidencias' : 'Este almacén está vacío'}</p><p className="mt-1 text-sm text-noche-muted">{search ? 'Prueba con otra búsqueda.' : 'Guarda la primera contraseña de este perfil.'}</p></div>}
    <div className="mt-5 space-y-3">{filtered.map((entry) => <article key={entry.id} className="rounded-xl border border-noche-border bg-noche-bg p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-noche-text">{entry.site}</h3>{entry.url.startsWith('https://') && <button aria-label={`Abrir ${entry.site}`} onClick={() => void openExternal(entry.url)} className="text-noche-muted hover:text-noche-text"><ExternalLink size={14} /></button>}</div><p className="mt-1 truncate text-sm text-noche-muted">{entry.username || 'Sin usuario'}</p>{entry.notes && <p className="mt-2 line-clamp-2 text-xs text-noche-muted">{entry.notes}</p>}<div className="mt-3 rounded-lg border border-noche-border bg-noche-surface px-3 py-2 font-mono text-sm text-noche-text">{revealed[entry.id] ?? '••••••••••••'}</div></div><div className="flex shrink-0 flex-col gap-1"><button aria-label={revealed[entry.id] ? 'Ocultar contraseña' : 'Revelar contraseña'} onClick={() => void reveal(entry)} className="rounded-lg p-2 text-noche-muted hover:bg-noche-surface hover:text-noche-text">{revealed[entry.id] ? <EyeOff size={16} /> : <Eye size={16} />}</button><button aria-label="Copiar contraseña" onClick={() => void copy(entry)} className="rounded-lg p-2 text-noche-muted hover:bg-noche-surface hover:text-noche-text"><Copy size={16} /></button><button aria-label="Editar entrada" onClick={() => void edit(entry)} className="rounded-lg p-2 text-noche-muted hover:bg-noche-surface hover:text-noche-text"><Pencil size={16} /></button><button aria-label="Eliminar entrada" onClick={() => void remove(entry)} className="rounded-lg p-2 text-noche-muted hover:bg-red-50 hover:text-red-500"><Trash2 size={16} /></button></div></div></article>)}</div>
    <button className="mt-8 text-xs text-red-500 underline" onClick={() => setResetConfirmation('')}>Eliminar todo el almacén de este perfil</button>
    <ModalPortal onClose={() => { setEditing(null); setChangeMaster(null); setResetConfirmation(null); }}>
    {editing && <EntryDialog value={editing} pending={actions.upsert.isPending} onClose={() => setEditing(null)} onSave={saveEntry} />}
    {changeMaster && <ChangeMasterDialog value={changeMaster} pending={actions.changeMaster.isPending} onChange={setChangeMaster} onClose={() => setChangeMaster(null)} onConfirm={async () => { if (changeMaster.next.length < 12) return setLocalError('La nueva contraseña maestra debe tener al menos 12 caracteres.'); if (changeMaster.next !== changeMaster.confirm) return setLocalError('Las contraseñas maestras no coinciden.'); try { await actions.changeMaster.mutateAsync({ currentPassword: changeMaster.current, newPassword: changeMaster.next }); setChangeMaster(null); setMessage('Contraseña maestra actualizada.'); } catch (error) { setLocalError(errorMessage(error)); } }} />}
    {resetConfirmation !== null && <ResetDialog value={resetConfirmation} onChange={setResetConfirmation} onClose={() => setResetConfirmation(null)} pending={actions.reset.isPending} onConfirm={async () => { try { await actions.reset.mutateAsync(resetConfirmation); setResetConfirmation(null); } catch (error) { setLocalError(errorMessage(error)); } }} />}
    </ModalPortal>
  </section>;
}

function EntryDialog({ value, pending, onClose, onSave }: { value: PasswordVaultEntryInput; pending: boolean; onClose(): void; onSave(value: PasswordVaultEntryInput): void | Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [showPassword, setShowPassword] = useState(false);
  const [length, setLength] = useState(20);
  async function generate() {
    const password = await passwordVaultRepository.generatePassword({ length, includeDigits: true, includeSymbols: true });
    setDraft((current) => ({ ...current, password })); setShowPassword(true);
  }
  return <div role="dialog" aria-modal="true" aria-labelledby="vault-entry-title" className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 p-4"><form onSubmit={(event) => { event.preventDefault(); void onSave(draft); }} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-noche-surface p-6 shadow-2xl"><header className="flex items-center justify-between"><h2 id="vault-entry-title" className="text-lg font-semibold text-noche-text">{draft.id ? 'Editar contraseña' : 'Nueva contraseña'}</h2><button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-full p-2 text-noche-muted hover:bg-noche-bg"><X size={18} /></button></header><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Sitio o servicio" value={draft.site} onChange={(site) => setDraft({ ...draft, site })} required /><Field label="Dirección web" value={draft.url} onChange={(url) => setDraft({ ...draft, url })} placeholder="https://…" /><Field label="Usuario o correo" value={draft.username} onChange={(username) => setDraft({ ...draft, username })} /><label className="text-sm text-noche-muted">Contraseña<div className="mt-1.5 flex"><input required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} className="min-w-0 flex-1 rounded-l-xl border border-noche-border bg-noche-bg px-3 py-2.5 font-mono text-noche-text" /><button type="button" aria-label={showPassword ? 'Ocultar' : 'Mostrar'} onClick={() => setShowPassword(!showPassword)} className="rounded-r-xl border border-l-0 border-noche-border bg-noche-bg px-3 text-noche-muted">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label></div><div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-noche-bg p-3"><label className="text-xs text-noche-muted">Longitud <input type="number" min="12" max="128" value={length} onChange={(event) => setLength(Math.max(12, Math.min(128, Number(event.target.value))))} className="ml-2 w-16 rounded-lg border border-noche-border bg-noche-surface px-2 py-1 text-noche-text" /></label><Button type="button" variant="ghost" size="sm" onClick={() => void generate()}><RefreshCw size={14} /> Generar segura</Button></div><label className="mt-4 block text-sm text-noche-muted">Notas<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={4} className="mt-1.5 w-full resize-y rounded-xl border border-noche-border bg-noche-bg px-3 py-2.5 text-noche-text" /></label><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending || !draft.site.trim() || !draft.password}>{pending ? 'Cifrando…' : 'Guardar cifrada'}</Button></div></form></div>;
}

function Field({ label, value, onChange, required, placeholder, type = 'text', autoComplete }: { label: string; value: string; onChange(value: string): void; required?: boolean; placeholder?: string; type?: string; autoComplete?: string }) {
  return <label className="text-sm text-noche-muted">{label}<input required={required} type={type} autoComplete={autoComplete} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-3 py-2.5 text-noche-text" /></label>;
}

function ChangeMasterDialog({ value, pending, onChange, onClose, onConfirm }: { value: { current: string; next: string; confirm: string }; pending: boolean; onChange(value: { current: string; next: string; confirm: string }): void; onClose(): void; onConfirm(): void | Promise<void> }) {
  return <div role="dialog" aria-modal="true" aria-labelledby="change-master-title" className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 p-4"><form onSubmit={(event) => { event.preventDefault(); void onConfirm(); }} className="w-full max-w-md rounded-2xl bg-noche-surface p-6 shadow-2xl"><h2 id="change-master-title" className="font-semibold text-noche-text">Cambiar contraseña maestra</h2><div className="mt-4 space-y-3"><Field label="Contraseña actual" type="password" autoComplete="current-password" value={value.current} onChange={(current) => onChange({ ...value, current })} required /><Field label="Nueva contraseña maestra" type="password" autoComplete="new-password" value={value.next} onChange={(next) => onChange({ ...value, next })} required /><Field label="Confirmar nueva contraseña" type="password" autoComplete="new-password" value={value.confirm} onChange={(confirm) => onChange({ ...value, confirm })} required /></div><p className="mt-3 text-xs text-noche-muted">La nueva contraseña debe tener al menos 12 caracteres.</p><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? 'Actualizando…' : 'Cambiar'}</Button></div></form></div>;
}

type ResetDialogProps = { value: string; pending: boolean; onChange(value: string): void; onClose(): void; onConfirm(): void | Promise<void> };

function ResetDialog(props: ResetDialogProps) {
  return <ModalPortal onClose={props.onClose}><ResetDialogSurface {...props} /></ModalPortal>;
}

function ResetDialogSurface({ value, pending, onChange, onClose, onConfirm }: ResetDialogProps) {
  return <div role="dialog" aria-modal="true" aria-labelledby="reset-vault-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"><form onSubmit={(event) => { event.preventDefault(); void onConfirm(); }} className="w-full max-w-md rounded-2xl bg-noche-surface p-6 shadow-2xl"><h2 id="reset-vault-title" className="font-semibold text-red-500">Eliminar almacén privado</h2><p className="mt-2 text-sm text-noche-muted">Se borrarán todas las contraseñas cifradas de este perfil. Para confirmar, escribe <strong className="text-noche-text">ELIMINAR</strong>.</p><input autoFocus value={value} onChange={(event) => onChange(event.target.value)} className="mt-4 w-full rounded-xl border border-red-300 bg-noche-bg px-4 py-3 text-noche-text" /><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending || value !== 'ELIMINAR'}>{pending ? 'Eliminando…' : 'Eliminar definitivamente'}</Button></div></form></div>;
}
