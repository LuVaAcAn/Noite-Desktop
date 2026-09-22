import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Copy, Delete, KeyRound, Power, Settings2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { profileDisplayName, type ProfileCredentialKind } from '@proyecto-noche/domain';
import { useSettings, useSwitchActor, useUpdateSettings } from '../../hooks/use-settings';
import { useUiStore } from '../../stores/ui-store';
import { exitApp } from '../../lib/system-status';
import { StatusBar } from './StatusBar';
import { ControllerHud } from './ControllerHud';
import { ArcadeLottie } from './ArcadeLottie';
import { playSound } from '../../lib/sound-manager';
import { AnimatedIsotipo } from './AnimatedIsotipo';
import { enterOpenProfile, profileAuthStatus, recoverProfile, setupProfileAuth, unlockProfile } from '../../lib/native-profile-auth';
import { Button } from './Button';
import { resolveStartupDestination } from '../../lib/startup-flow';
import { RecoveryScreen } from './RecoveryScreen';
import { DevicePersonPanel } from '../../features/settings/DevicePersonPanel';

const MINIMUM_BOOT_MS = 650;

export function AppEntryExperience({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const settingsQuery = useSettings();
  const settings = settingsQuery.data;
  const updateSettings = useUpdateSettings();
  const switchActor = useSwitchActor();
  const entryState = useUiStore((state) => state.entryState);
  const setEntryState = useUiStore((state) => state.setEntryState);
  const autoResumeEnabled = useUiStore((state) => state.autoResumeEnabled);
  const bootStartedAt = useRef(performance.now());
  const bootDecisionStarted = useRef(false);
  const [slowBoot, setSlowBoot] = useState(false);
  const [authTarget, setAuthTarget] = useState<'me' | null>(null);
  const [authKind, setAuthKind] = useState<ProfileCredentialKind>('pin');
  const [credential, setCredential] = useState('');
  const [authSetup, setAuthSetup] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const english = settings?.locale === 'en';

  const completeEnter = useCallback(async () => {
    if (!settings) return;
    playSound('confirm');
    await switchActor.mutateAsync(settings.activeProfileId);
    setEntryState('app');
    navigate('/', { replace: true });
  }, [navigate, setEntryState, settings, switchActor]);

  const requestLocalAccess = useCallback(async () => {
    if (!settings) return;
    const status = await profileAuthStatus(settings.activeProfileId);
    if (status.unlocked) { await completeEnter(); return; }
    if (status.accessMode === 'open') { await enterOpenProfile(status.profileId); await completeEnter(); return; }
    setAuthTarget('me');
    setAuthSetup(status.accessMode === 'setup_required');
    setAuthKind(status.credentialKind ?? 'pin');
    setCredential('');
    setAuthError(null);
    setRecoveryMode(false);
    setEntryState('title');
  }, [completeEnter, setEntryState, settings]);

  const continueFromCurrentState = useCallback(async () => {
    if (!settings || settingsQuery.isLoading) return;
    const destination = resolveStartupDestination({
      onboardingStage: settings.onboardingStage,
      onboardingComplete: settings.onboardingComplete,
    });
    if (destination === 'title') { setEntryState('title'); return; }
    if (destination === 'local-access') { await requestLocalAccess(); return; }
    setEntryState('app');
    navigate(destination === 'language' ? '/bienvenida' : '/cuenta', { replace: true });
  }, [navigate, requestLocalAccess, setEntryState, settings, settingsQuery.isLoading]);

  useEffect(() => {
    if (entryState !== 'boot' || bootDecisionStarted.current || settingsQuery.isLoading) return;
    const remaining = Math.max(0, MINIMUM_BOOT_MS - (performance.now() - bootStartedAt.current));
    const timer = window.setTimeout(() => {
      bootDecisionStarted.current = true;
      if (autoResumeEnabled) void continueFromCurrentState().catch((cause) => { setAuthError(String(cause)); setEntryState('title'); });
      else setEntryState('title');
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [autoResumeEnabled, continueFromCurrentState, entryState, setEntryState, settingsQuery.isLoading]);

  useEffect(() => {
    if (entryState !== 'boot') { setSlowBoot(false); return; }
    const timer = window.setTimeout(() => setSlowBoot(true), 2800);
    return () => window.clearTimeout(timer);
  }, [entryState]);

  useEffect(() => {
    if (entryState !== 'title-settings') return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setEntryState('title'); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [entryState, setEntryState]);

  async function submitAuth() {
    if (!authTarget || !settings) return;
    const profileId = settings.activeProfileId;
    try {
      if (authSetup) {
        const result = await setupProfileAuth(profileId, authKind, credential, settings.locale);
        setRecoveryCode(result.recoveryCode);
      } else {
        if (recoveryMode) await recoverProfile(profileId, credential);
        else await unlockProfile(profileId, credential);
        setAuthTarget(null);
        await completeEnter();
      }
    } catch (cause) { setAuthError(cause instanceof Error ? cause.message : english ? 'Noite could not unlock this profile.' : 'Noite no pudo desbloquear este perfil.'); }
  }


  if (settingsQuery.isError) return <RecoveryScreen />;
  if (entryState === 'app') return children;

  return <div className="grid h-dvh overflow-hidden bg-noche-bg text-noche-text [grid-template-rows:auto_minmax(0,1fr)_auto]">
    <StatusBar titleScreen locale={settings?.locale} />
    <main className="relative min-h-0 overflow-hidden">
      <TitleBackdrop reduced={Boolean(reduced)} />
      <AnimatePresence mode="wait">
        {entryState === 'boot' && <motion.div key="boot" exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.22 }} className="relative z-10 grid h-full place-items-center px-6 text-center"><div><ArcadeLottie variant="loading" className="mx-auto h-32 w-32" /><p className="font-title text-sm font-bold uppercase tracking-[0.38em] text-noche-text">{english ? 'Preparing Noite' : 'Preparando Noite'}</p><p className="mt-3 min-h-5 text-xs text-noche-text">{slowBoot ? (english ? 'Loading your local library…' : 'Abriendo tu biblioteca local…') : ''}</p></div></motion.div>}

        {entryState === 'title' && <motion.section key="title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: reduced ? 0 : 0.32 }} className="relative z-10 mx-auto grid h-full w-full max-w-6xl items-center gap-10 px-8 py-10 lg:grid-cols-[1.25fr_.75fr] lg:px-14">
          <div className="max-w-2xl text-left">
            <div className="flex items-center gap-5"><AnimatedIsotipo className="h-24 w-24 shrink-0 drop-shadow-[0_0_38px_rgba(168,85,247,.28)]" /><motion.h1 animate={reduced ? undefined : { y: [-3, 3, -3] }} transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }} className="font-title text-6xl font-bold uppercase leading-none tracking-[0.1em] sm:text-7xl">NOITE</motion.h1></div>
            <h2 className="mt-7 max-w-xl text-2xl font-semibold leading-tight text-noche-text sm:text-3xl">{english ? 'Plans, memories and the things you enjoy together.' : 'Planes, recuerdos y todo lo que disfrutan juntos.'}</h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-noche-text">{english ? 'Choose what comes next and keep every moment close.' : 'Elijan lo que viene y guarden cerca cada momento.'}</p>
          </div>

          <div className="justify-self-stretch rounded-[28px] border border-noche-border bg-noche-surface/90 p-5 shadow-[0_28px_90px_rgba(0,0,0,.45)] backdrop-blur-2xl lg:max-w-sm lg:justify-self-end">
            <div className="mt-5 grid gap-3" data-controller-scope="actions">
              <button autoFocus onClick={() => { playSound('dialog'); void continueFromCurrentState().catch((cause) => setAuthError(String(cause))); }} className="noite-title-primary"><span>{english ? 'Continue' : 'Continuar'}</span><ArrowRight size={19} /></button>
              {authError && !authTarget && <p role="alert" className="text-sm text-red-700">{authError}</p>}
              {settings?.partnerName && <details className="text-sm"><summary className="cursor-pointer">Cambiar persona en este equipo</summary><DevicePersonPanel settings={settings} /></details>}
              <button onClick={() => { playSound('dialog'); setEntryState('title-settings'); }} className="noite-title-secondary"><Settings2 size={17} />{english ? 'Quick settings' : 'Ajustes rápidos'}</button>
            </div>
            <button onClick={() => void exitApp()} className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-noche-text transition hover:text-red-200"><Power size={14} />{english ? 'Exit Noite' : 'Salir de Noite'}</button>
          </div>
        </motion.section>}

        {entryState === 'title-settings' && settings && <motion.div key="settings" role="dialog" aria-modal="true" aria-labelledby="quick-settings-title" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex justify-end bg-black/55 backdrop-blur-sm"><motion.section initial={{ x: 50 }} animate={{ x: 0 }} exit={{ x: 50 }} transition={{ duration: reduced ? 0 : 0.24 }} className="h-full w-full max-w-md overflow-y-auto border-l border-noche-border bg-noche-surface/95 p-7 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-purple-700">NOITE</p><h1 id="quick-settings-title" className="mt-2 text-2xl font-semibold">{english ? 'Quick settings' : 'Ajustes rápidos'}</h1><p className="mt-2 text-sm text-noche-text">{english ? 'Comfort and accessibility before entering.' : 'Comodidad y accesibilidad antes de entrar.'}</p></div><button data-dialog-close aria-label={english ? 'Close settings' : 'Cerrar ajustes'} className="rounded-full border border-noche-border p-2 text-noche-text hover:bg-noche-surface-hover hover:text-noche-text" onClick={() => setEntryState('title')}><X size={18} /></button></div><div className="mt-7 grid gap-3"><QuickToggle label={english ? 'Sound effects' : 'Efectos de sonido'} checked={settings.audioSettings.sfxEnabled} onChange={(checked) => updateSettings.mutate({ audioSettings: { ...settings.audioSettings, sfxEnabled: checked } })} /><QuickToggle label={english ? 'Title ambience' : 'Ambiente del título'} checked={settings.audioSettings.titleAmbienceEnabled} onChange={(checked) => updateSettings.mutate({ audioSettings: { ...settings.audioSettings, titleAmbienceEnabled: checked } })} /><QuickToggle label={english ? 'Controller navigation' : 'Navegación con control'} checked={settings.controllerNavigationEnabled} onChange={(checked) => updateSettings.mutate({ controllerNavigationEnabled: checked })} /><label className="noite-quick-setting"><span>{english ? 'Movement' : 'Movimiento'}</span><select className="rounded-lg border border-noche-border bg-noche-bg px-2 py-1.5" value={settings.motionMode} onChange={(event) => updateSettings.mutate({ motionMode: event.target.value as typeof settings.motionMode })}><option className="text-black" value="system">{english ? 'System' : 'Sistema'}</option><option className="text-black" value="full">{english ? 'Full' : 'Completo'}</option><option className="text-black" value="reduced">{english ? 'Reduced' : 'Reducido'}</option></select></label><label className="noite-quick-setting"><span>{english ? 'Language' : 'Idioma'}</span><select className="rounded-lg border border-noche-border bg-noche-bg px-2 py-1.5" value={settings.locale} onChange={(event) => updateSettings.mutate({ locale: event.target.value as 'es' | 'en' })}><option className="text-black" value="es">Español</option><option className="text-black" value="en">English</option></select></label><label className="mt-2 rounded-2xl border border-noche-border bg-noche-surface-hover p-4 text-sm text-noche-text"><span className="flex justify-between"><span>{english ? 'Effects volume' : 'Volumen de efectos'}</span><strong>{Math.round(settings.audioSettings.sfxVolume * 100)}%</strong></span><input aria-label={english ? 'Effects volume' : 'Volumen de efectos'} className="mt-4 w-full accent-purple-500" type="range" min="0" max="1" step="0.05" value={settings.audioSettings.sfxVolume} onChange={(event) => updateSettings.mutate({ audioSettings: { ...settings.audioSettings, sfxVolume: Number(event.target.value) } })} /></label></div><Button className="mt-7 w-full" onClick={() => setEntryState('title')}>{english ? 'Done' : 'Listo'}</Button></motion.section></motion.div>}
      </AnimatePresence>

      {authTarget && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4"><form onSubmit={(event) => { event.preventDefault(); void submitAuth(); }} className="w-full max-w-sm rounded-[26px] border border-noche-border bg-noche-surface p-6 shadow-2xl"><KeyRound className="text-purple-700" /><h2 className="mt-3 text-xl font-semibold">{authSetup ? (english ? 'Set up local access' : 'Configura el acceso local') : recoveryMode ? (english ? 'Use recovery code' : 'Usar código de recuperación') : `${english ? 'Welcome back' : 'Te damos la bienvenida'}, ${settings ? profileDisplayName(settings, settings.activeProfileId) : ''}`}</h2><p className="mt-2 text-sm text-noche-text">{english ? 'Your Noite account is ready. Unlock this device to continue.' : 'Tu cuenta de Noite está lista. Desbloquea este equipo para continuar.'}</p>{authSetup && <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setAuthKind('pin'); setCredential(''); }} className={`rounded-xl p-2 text-sm ${authKind === 'pin' ? 'bg-purple-500 text-noche-text' : 'bg-noche-surface-hover'}`}>PIN</button><button type="button" onClick={() => { setAuthKind('password'); setCredential(''); }} className={`rounded-xl p-2 text-sm ${authKind === 'password' ? 'bg-purple-500 text-noche-text' : 'bg-noche-surface-hover'}`}>{english ? 'Password' : 'Contraseña'}</button></div>}{recoveryMode ? <input autoFocus value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={english ? 'Recovery code' : 'Código de recuperación'} className="mt-5 w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-3 font-mono text-sm" /> : authKind === 'pin' ? <PinPad value={credential} onChange={setCredential} /> : <input autoFocus type="password" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={english ? 'Password' : 'Contraseña'} className="mt-5 w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-3" />}{!authSetup && <button type="button" className="mt-3 text-xs text-purple-700 underline" onClick={() => { setRecoveryMode((value) => !value); setCredential(''); setAuthError(null); }}>{recoveryMode ? (english ? 'Use my PIN or password' : 'Usar mi PIN o contraseña') : (english ? 'I forgot my credential' : 'Olvidé mi credencial')}</button>}{authError && <p role="alert" className="mt-3 text-sm text-red-700">{authError}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAuthTarget(null)}>{english ? 'Cancel' : 'Cancelar'}</Button><Button type="submit" disabled={recoveryMode ? credential.length < 20 : authKind === 'pin' ? credential.length !== 4 : credential.length < 8}>{authSetup ? (english ? 'Set up' : 'Configurar') : (english ? 'Enter' : 'Entrar')}</Button></div></form></div>}
      {recoveryCode && authTarget && <div className="fixed inset-0 z-[110] grid place-items-center bg-black/90 p-4"><section className="w-full max-w-md rounded-[26px] border border-emerald-400/30 bg-noche-surface p-6"><h2 className="text-xl font-semibold">{english ? 'Save your recovery code' : 'Guarda el código de recuperación'}</h2><p className="mt-2 text-sm text-noche-text">{english ? 'It is shown only once.' : 'Solo se mostrará esta vez.'}</p><div className="mt-4 flex gap-3 rounded-xl bg-noche-bg p-4"><code className="min-w-0 flex-1 break-all text-xs">{recoveryCode}</code><button onClick={() => void navigator.clipboard.writeText(recoveryCode)}><Copy size={17} /></button></div><Button className="mt-5 w-full" onClick={async () => { setRecoveryCode(null); setAuthTarget(null); await completeEnter(); }}>{english ? 'I saved it' : 'Ya lo guardé'}</Button></section></div>}
    </main>
    <ControllerHud titleScreen />
  </div>;
}

function TitleBackdrop({ reduced }: { reduced: boolean }) {
  return <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-noche-bg"><div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,rgba(126,34,206,.28),transparent_34%),radial-gradient(circle_at_82%_76%,rgba(79,70,229,.18),transparent_32%),linear-gradient(145deg,#fafaff,#f3edff_52%,#f8fafc)]" /><motion.div animate={reduced ? undefined : { x: [-18, 18, -18], y: [-8, 12, -8], scale: [1, 1.08, 1] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} className="absolute left-[8%] top-[12%] h-72 w-72 rounded-full bg-purple-600/10 blur-3xl" /><motion.div animate={reduced ? undefined : { x: [16, -14, 16], y: [10, -14, 10] }} transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }} className="absolute bottom-[5%] right-[8%] h-80 w-80 rounded-full bg-indigo-500/[.08] blur-3xl" /><div className="absolute inset-0 opacity-[.17] [background-image:linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" /></div>;
}


function QuickToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="noite-quick-setting"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-purple-500" /></label>;
}

function PinPad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="mt-5"><div className="mb-4 flex justify-center gap-2">{[0,1,2,3].map((index) => <span key={index} className={`h-3 w-3 rounded-full border border-purple-400 ${value.length > index ? 'bg-purple-400' : ''}`} />)}</div><div className="mx-auto grid max-w-[210px] grid-cols-3 gap-2">{[1,2,3,4,5,6,7,8,9].map((number) => <button type="button" key={number} onClick={() => onChange(value.length < 4 ? `${value}${number}` : value)} className="aspect-square rounded-xl bg-noche-surface-hover text-lg font-bold hover:bg-noche-surface-hover">{number}</button>)}<span /><button type="button" onClick={() => onChange(value.length < 4 ? `${value}0` : value)} className="aspect-square rounded-xl bg-noche-surface-hover text-lg font-bold hover:bg-noche-surface-hover">0</button><button type="button" aria-label="Borrar" onClick={() => onChange(value.slice(0, -1))} className="grid aspect-square place-items-center rounded-xl bg-noche-surface-hover"><Delete size={18} /></button></div></div>;
}
