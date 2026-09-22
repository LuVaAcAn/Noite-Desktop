import { useEffect, useState } from 'react';
import { listNativeBackups, restoreNativeBackup, type NativeBackupInfo } from '../../lib/native-persistence';

export function RecoveryScreen() {
  const [backups, setBackups] = useState<NativeBackupInfo[]>([]);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => { void listNativeBackups().then(setBackups).catch(() => setBackups([])); }, []);
  const latest = backups[0];
  return <main className="flex h-dvh items-center justify-center overflow-hidden bg-noche-bg p-6 text-center text-noche-text"><div className="w-full max-w-lg rounded-sm border border-noche-border bg-noche-surface p-8 shadow-2xl"><p className="font-title text-xs font-bold uppercase tracking-[0.3em] text-violet-700">Noite · Recuperación</p><h1 className="mt-3 text-2xl font-semibold">No se pudieron abrir tus datos</h1><p className="mt-3 text-sm text-noche-text">Noite no reinició ni borró la base de datos. Puedes intentar restaurar el respaldo automático más reciente.</p>{latest ? <button disabled={restoring} className="mt-6 rounded-sm bg-white px-5 py-3 text-sm font-bold text-black disabled:opacity-50" onClick={async () => { setRestoring(true); try { await restoreNativeBackup(latest.id); window.location.reload(); } finally { setRestoring(false); } }}>{restoring ? 'Restaurando…' : `Restaurar respaldo del ${new Date(latest.createdAt).toLocaleString('es-PE')}`}</button> : <p className="mt-6 rounded-sm border border-amber-300/25 bg-amber-300/10 p-3 text-sm text-amber-800">No se encontró un respaldo automático utilizable.</p>}<button className="mt-4 block w-full text-sm text-noche-text underline" onClick={() => window.location.reload()}>Intentar abrir de nuevo</button></div></main>;
}
