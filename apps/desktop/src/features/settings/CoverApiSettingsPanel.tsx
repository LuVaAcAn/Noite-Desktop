import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ExternalLink, HelpCircle, KeyRound, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { clearCoverCredentials, getCoverCredentialStatus, saveCoverCredentials, testCoverCredentials, type CoverCredentialStatus } from '../../lib/native-cover-search';
import { openExternal } from '../../lib/system-status';
import { Modal } from '../../components/ui/Overlay';

function TutorialLink({ href, children }: { href: string; children: string }) {
  return <button type="button" onClick={() => void openExternal(href)} className="inline-flex items-center gap-1 font-semibold text-[rgb(var(--theme-accent))] underline underline-offset-2 hover:opacity-80">{children}<ExternalLink size={12} aria-hidden="true" /></button>;
}

export function CoverApiSettingsPanel() {
  const [status, setStatus] = useState<CoverCredentialStatus>({ tmdbConfigured: false, igdbConfigured: false });
  const [tmdb, setTmdb] = useState('');
  const [igdbId, setIgdbId] = useState('');
  const [igdbSecret, setIgdbSecret] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => { void getCoverCredentialStatus().then(setStatus); }, []);
  async function run(label: string, action: () => Promise<unknown>, success: string) {
    setBusy(label); setMessage(null);
    try { await action(); setStatus(await getCoverCredentialStatus()); setMessage(success); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); }
    finally { setBusy(null); }
  }


  return <>
  <section className="rounded-[14px] border border-noche-border bg-noche-surface p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-semibold text-noche-text"><KeyRound size={19} /> API Keys de portadas</h2>
      <Button type="button" size="sm" variant="ghost" aria-haspopup="dialog" aria-expanded={tutorialOpen} onClick={() => setTutorialOpen(true)}><HelpCircle size={15} /> ¿Cómo consigo las claves?</Button>
    </div>
    <p className="mt-2 text-sm leading-6 text-noche-muted">TMDB busca películas y series; IGDB busca videojuegos. Las credenciales se guardan en el almacén seguro del sistema y solo viajan dentro de respaldos .noche v5 completamente cifrados.</p>

    <div className="mt-6 grid gap-5">
      <div className="rounded-xl border border-noche-border bg-noche-bg p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-noche-text">TMDB</h3>{status.tmdbConfigured && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 size={14} /> Configurada</span>}</div>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-noche-muted">API Key v3<input type="password" autoComplete="off" value={tmdb} onChange={(event) => setTmdb(event.target.value)} placeholder={status.tmdbConfigured ? '•••••••• (guardada)' : 'Pega tu API Key'} className="mt-2 h-11 w-full rounded-[11px] border border-noche-border bg-noche-surface px-4 text-sm text-noche-text" /></label>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={!tmdb.trim() || busy !== null} onClick={() => void run('tmdb-save', () => saveCoverCredentials({ tmdbApiKey: tmdb }).then(() => setTmdb('')), 'Credencial de TMDB guardada.')}>Guardar</Button><Button size="sm" variant="ghost" disabled={!status.tmdbConfigured || busy !== null} onClick={() => void run('tmdb-test', () => testCoverCredentials('tmdb'), 'Conexión con TMDB verificada.')}>Probar</Button>{status.tmdbConfigured && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run('tmdb-clear', () => clearCoverCredentials('tmdb'), 'Credencial de TMDB eliminada.')}><Trash2 size={14} /> Quitar</Button>}</div>
      </div>

      <div className="rounded-xl border border-noche-border bg-noche-bg p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-noche-text">IGDB / Twitch</h3>{status.igdbConfigured && <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 size={14} /> Configurada</span>}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold uppercase tracking-wide text-noche-muted">Client ID<input type="password" autoComplete="off" value={igdbId} onChange={(event) => setIgdbId(event.target.value)} placeholder={status.igdbConfigured ? '•••••••• (guardado)' : 'Client ID'} className="mt-2 h-11 w-full rounded-[11px] border border-noche-border bg-noche-surface px-4 text-sm text-noche-text" /></label><label className="block text-xs font-semibold uppercase tracking-wide text-noche-muted">Client Secret<input type="password" autoComplete="off" value={igdbSecret} onChange={(event) => setIgdbSecret(event.target.value)} placeholder={status.igdbConfigured ? '•••••••• (guardado)' : 'Client Secret'} className="mt-2 h-11 w-full rounded-[11px] border border-noche-border bg-noche-surface px-4 text-sm text-noche-text" /></label></div>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={!igdbId.trim() || !igdbSecret.trim() || busy !== null} onClick={() => void run('igdb-save', () => saveCoverCredentials({ igdbClientId: igdbId, igdbClientSecret: igdbSecret }).then(() => { setIgdbId(''); setIgdbSecret(''); }), 'Credenciales de IGDB guardadas.')}>Guardar</Button><Button size="sm" variant="ghost" disabled={!status.igdbConfigured || busy !== null} onClick={() => void run('igdb-test', () => testCoverCredentials('igdb'), 'Conexión con IGDB verificada.')}>Probar</Button>{status.igdbConfigured && <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void run('igdb-clear', () => clearCoverCredentials('igdb'), 'Credenciales de IGDB eliminadas.')}><Trash2 size={14} /> Quitar</Button>}</div>
      </div>
    </div>
    {message && <p role="status" className="mt-4 text-sm text-noche-muted">{message}</p>}
  </section>

  {tutorialOpen && (
    <Modal labelledBy="cover-api-tutorial-title" className="grid place-items-center overflow-y-auto bg-black/65 p-4" closeOnBackdrop onClose={() => setTutorialOpen(false)}>
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-noche-border bg-noche-surface p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[rgb(var(--theme-accent))]">Tutorial de portadas</p><h2 id="cover-api-tutorial-title" className="mt-1 text-xl font-semibold text-noche-text">Obtener credenciales de TMDB e IGDB</h2></div>
          <button type="button" autoFocus aria-label="Cerrar tutorial" onClick={() => setTutorialOpen(false)} className="rounded-full p-2 text-noche-muted hover:bg-noche-bg hover:text-noche-text"><X size={18} /></button>
        </header>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section aria-labelledby="tmdb-tutorial-title" className="rounded-xl border border-noche-border p-4">
            <h3 id="tmdb-tutorial-title" className="font-semibold text-noche-text">Películas y series · TMDB</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-noche-muted">
              <li>Crea una cuenta gratuita en <TutorialLink href="https://www.themoviedb.org/signup">TMDB</TutorialLink> o inicia sesión.</li>
              <li>Abre <TutorialLink href="https://www.themoviedb.org/settings/api">Ajustes → API</TutorialLink> desde una computadora.</li>
              <li>Solicita una API key, acepta los términos y completa la información de tu aplicación.</li>
              <li>Copia la <strong className="text-noche-text">API Key v3</strong> y pégala en el campo TMDB de Noite. No uses el “API Read Access Token”.</li>
              <li>Guarda y pulsa <strong className="text-noche-text">Probar</strong>.</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-noche-muted">Consulta también la <TutorialLink href="https://developer.themoviedb.org/docs/authentication-application">guía oficial de autenticación</TutorialLink>.</p>
          </section>

          <section aria-labelledby="igdb-tutorial-title" className="rounded-xl border border-noche-border p-4">
            <h3 id="igdb-tutorial-title" className="font-semibold text-noche-text">Videojuegos · IGDB/Twitch</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-noche-muted">
              <li>Crea una cuenta gratuita en <TutorialLink href="https://www.twitch.tv/signup">Twitch</TutorialLink>.</li>
              <li>Activa la <TutorialLink href="https://www.twitch.tv/settings/security">autenticación en dos pasos</TutorialLink>.</li>
              <li>Registra Noite en el <TutorialLink href="https://dev.twitch.tv/console/apps/create">Twitch Developer Portal</TutorialLink>.</li>
              <li>En OAuth Redirect URL escribe <code className="rounded bg-noche-bg px-1.5 py-0.5 text-noche-text">http://localhost</code>. IGDB no utiliza esta redirección, pero Twitch exige completar el campo.</li>
              <li>Selecciona <strong className="text-noche-text">Confidential</strong> como Client Type para poder generar secretos.</li>
              <li>Abre <TutorialLink href="https://dev.twitch.tv/console/apps">Manage Applications</TutorialLink>, entra a la aplicación y pulsa <strong className="text-noche-text">New Secret</strong>.</li>
              <li>Copia el <strong className="text-noche-text">Client ID</strong> y el <strong className="text-noche-text">Client Secret</strong>, pégalos en Noite, guarda y pulsa <strong className="text-noche-text">Probar</strong>.</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-noche-muted">Pasos basados en la <TutorialLink href="https://api-docs.igdb.com/#account-creation">documentación oficial de IGDB</TutorialLink>.</p>
          </section>
        </div>

        <p className="mt-5 rounded-xl bg-noche-bg p-3 text-xs leading-5 text-noche-muted">Guarda estas credenciales solo en Noite. No las publiques, no las incluyas en capturas y no compartas el Client Secret.</p>
      </div>
    </Modal>
  )}
  </>;
}
