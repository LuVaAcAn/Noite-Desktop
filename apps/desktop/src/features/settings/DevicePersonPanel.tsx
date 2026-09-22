import { useState } from 'react';
import { profileDisplayName, type LocalSettings } from '@proyecto-noche/domain';
import { settingsRepository } from '../../lib/repositories';
import { lockAllProfiles } from '../../lib/native-profile-auth';
import { lockAllPasswordVaults } from '../../lib/native-password-vault';
import { Button } from '../../components/ui/Button';

export function DevicePersonPanel({ settings }: { settings: LocalSettings }) {
  const [selected, setSelected] = useState(settings.activeProfileId);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="mt-4 space-y-3 rounded-xl border border-noche-border bg-noche-bg p-4">
    <h3 className="font-semibold">Quién soy en este equipo</h3>
    <p className="text-sm text-noche-muted">Ahora: {profileDisplayName(settings, settings.activeProfileId)}. Esta elección se recuerda solo aquí, no se copia desde el respaldo de tu pareja. Las ideas y opiniones anteriores conservan su autoría.</p>
    <label className="block text-sm">Usar Noite como<select aria-label="Usar Noite como" disabled={busy} value={selected} onChange={(event) => { setSelected(event.target.value); setConfirmed(false); }} className="mt-1 w-full rounded-xl border border-noche-border bg-noche-surface p-2 text-noche-text">
      <option value={settings.profiles.primary.id}>{settings.userName || 'Primera persona'}</option>
      {settings.partnerName && <option value={settings.profiles.partner.id}>{settings.partnerName}</option>}
    </select></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo que soy {profileDisplayName(settings, selected)}.</label>
    <p className="text-sm text-noche-muted">Se bloquearán las bóvedas y se recargará Noite. Si el perfil tiene PIN o contraseña, deberás introducirlo; si es nuevo, configurarás su acceso. Esto no comparte ni restablece contraseñas.</p>
    <Button disabled={busy || !confirmed || selected === settings.activeProfileId} onClick={async () => {
      if (!confirmed || busy) return;
      setBusy(true); setError('');
      try {
        await lockAllPasswordVaults();
        await lockAllProfiles();
        await settingsRepository.setActiveActor(selected);
        window.location.reload();
      } catch { setError('No se pudo cambiar de persona. Reinicia Noite antes de continuar.'); setBusy(false); }
    }}>{busy ? 'Cambiando…' : 'Confirmar persona y reiniciar'}</Button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
