import { useEffect, useState } from 'react';
import { Battery, BatteryCharging, BluetoothConnected, Headphones, MonitorSpeaker, Volume2, Wifi, WifiOff } from 'lucide-react';
import type { Locale } from '@proyecto-noche/domain';
import { getSystemStatus, type SystemStatus } from '../../lib/system-status';
import { useSettings } from '../../hooks/use-settings';

const EMPTY_STATUS: SystemStatus = { batteryPercent: null, charging: null, audioOutputName: null, audioOutputKind: null };

export function StatusBar({ titleScreen = false, locale }: { titleScreen?: boolean; locale?: Locale }) {
  const { data: settings } = useSettings();
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(() => new Date());
  const [system, setSystem] = useState<SystemStatus>(EMPTY_STATUS);

  useEffect(() => {
    const onlineListener = () => setOnline(navigator.onLine);
    window.addEventListener('online', onlineListener);
    window.addEventListener('offline', onlineListener);
    return () => { window.removeEventListener('online', onlineListener); window.removeEventListener('offline', onlineListener); };
  }, []);
  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(clock);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => void getSystemStatus().then((value) => active && setSystem(value)).catch(() => active && setSystem(EMPTY_STATUS));
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const effectiveLocale = locale ?? settings?.locale ?? (navigator.language.toLowerCase().startsWith('en') ? 'en' : 'es');
  const localeTag = effectiveLocale === 'en' ? 'en-US' : 'es-PE';
  const date = now.toLocaleDateString(localeTag, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit', hour12: false });
  const AudioIcon = system.audioOutputKind === 'bluetooth' ? BluetoothConnected : system.audioOutputKind === 'headphones' ? Headphones : system.audioOutputKind === 'speaker' ? MonitorSpeaker : Volume2;

  return <div className={`noite-statusbar layer-chrome relative grid h-7 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-[var(--shell-gutter)] text-[11px] font-medium backdrop-blur-xl ${titleScreen ? 'border-noche-border bg-noche-surface text-noche-muted' : 'border-noche-border/80 bg-noche-surface/85 text-noche-muted'}`}>
    <div className="flex items-center gap-2" aria-label={online ? (effectiveLocale === 'en' ? 'Network available' : 'Red disponible') : (effectiveLocale === 'en' ? 'No network connection' : 'Sin conexión de red')}>{online ? <Wifi size={14} className="text-[rgb(var(--theme-accent))]" /> : <WifiOff size={14} className="opacity-50" />}<span className="hidden sm:inline">{online ? (effectiveLocale === 'en' ? 'ONLINE' : 'EN LÍNEA') : (effectiveLocale === 'en' ? 'OFFLINE' : 'SIN RED')}</span></div>
    <time dateTime={now.toISOString()} className="max-w-[52vw] truncate uppercase tracking-[0.08em]">{date} · {time}</time>
    <div className="flex items-center justify-end gap-3">
      {system.audioOutputName && <span className="flex max-w-48 items-center gap-1.5 truncate" title={system.audioOutputName}><AudioIcon size={14} /><span className="hidden lg:inline truncate">{system.audioOutputName}</span></span>}
      {system.batteryPercent != null && <span className="flex items-center gap-1.5" aria-label={`${effectiveLocale === 'en' ? 'Battery' : 'Batería'} ${system.batteryPercent}%${system.charging ? (effectiveLocale === 'en' ? ', charging' : ', cargando') : ''}`}>{system.charging ? <BatteryCharging size={15} className="text-emerald-500" /> : <Battery size={15} />}<span>{system.batteryPercent}%</span></span>}
    </div>
  </div>;
}
