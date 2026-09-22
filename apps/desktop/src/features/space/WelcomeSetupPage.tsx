import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Locale } from '@proyecto-noche/domain';
import { Button } from '../../components/ui/Button';
import { useSettings, useUpdateSettings } from '../../hooks/use-settings';
import { setRuntimeLocale } from '../../lib/i18n-runtime';
import { setupOpenProfile } from '../../lib/native-profile-auth';

export function WelcomeSetupPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [locale, setLocale] = useState<Locale | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const english = locale === 'en';

  useEffect(() => {
    if (!settings.data || locale || settings.data.onboardingStage === 'language') return;
    setLocale(settings.data.locale);
    setName(settings.data.userName);
    setRuntimeLocale(settings.data.locale);
  }, [locale, settings.data]);

  async function selectLanguage(value: Locale) {
    setSaving(true); setError(null);
    try {
      setRuntimeLocale(value);
      await updateSettings.mutateAsync({ locale: value, onboardingStage: 'auth', onboardingComplete: false });
      setLocale(value);
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  }

  async function finish() {
    if (!locale || !name.trim()) return;
    setSaving(true); setError(null);
    try {
      // Create local access before completing onboarding so a failed write can be retried.
      if (!settings.data) throw new Error('No se pudieron leer los datos locales.');
      await setupOpenProfile(settings.data.profiles.primary.id, locale);
      await updateSettings.mutateAsync({ locale, userName: name.trim(), colorMode: 'light', onboardingStage: 'complete', onboardingComplete: true, setupVersion: 7 });
      navigate('/', { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  }

  if (settings.isLoading) return <Backdrop><p>Cargando…</p></Backdrop>;
  if (settings.isError) return <Backdrop><p role="alert">No se pudieron abrir tus datos.</p><Button onClick={() => void settings.refetch()}>Reintentar</Button></Backdrop>;
  return <Backdrop><section className="w-full max-w-lg rounded-3xl border border-noche-border bg-noche-surface p-8 shadow-xl">
    <p className="font-wordmark text-xs font-bold tracking-[.2em] text-purple-700">NOITE · LOCAL</p>
    {!locale ? <><h1 className="mt-3 text-2xl font-bold">Elige tu idioma · Choose your language</h1><div className="mt-7 flex gap-4"><Button disabled={saving} onClick={() => void selectLanguage('es')}>Español</Button><Button disabled={saving} onClick={() => void selectLanguage('en')}>English</Button></div></> :
      <form onSubmit={(event) => { event.preventDefault(); void finish(); }}>
        <h1 className="mt-3 text-3xl font-bold">{english ? 'Make Noite yours' : 'Haz Noite a tu manera'}</h1>
        <p className="mt-3 text-sm leading-6 text-noche-muted">{english ? 'Your library, plans and memories stay on this computer. No account or connection is required.' : 'Tu biblioteca, planes y recuerdos se guardan en esta computadora. No necesitas una cuenta ni conexión.'}</p>
        <label className="mt-6 block text-sm">{english ? 'Your name' : 'Tu nombre'}<input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-noche-border bg-noche-bg px-4 text-noche-text" /></label>
        <div className="mt-7 flex justify-between"><Button type="button" variant="ghost" disabled={saving} onClick={() => void (async () => { await updateSettings.mutateAsync({ onboardingStage: 'language' }); setLocale(null); })().catch((cause) => setError(String(cause)))}>{english ? 'Language' : 'Idioma'}</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? (english ? 'Saving…' : 'Guardando…') : (english ? 'Enter Noite' : 'Entrar a Noite')}</Button></div>
      </form>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
  </section></Backdrop>;
}

function Backdrop({ children }: { children: ReactNode }) {
  return <div className="grid h-dvh place-items-center overflow-y-auto bg-gradient-to-br from-slate-50 to-purple-50 px-5 py-8 text-noche-text">{children}</div>;
}
