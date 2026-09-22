import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Moon, PanelsTopLeft, RotateCcw, Save, Sparkles, Sun, Volume2, X } from 'lucide-react';
import type { LocalSettings, MotionMode, SectionAppearance } from '@proyecto-noche/domain';
import { useUpdateSettings } from '../../hooks/use-settings';
import { accentFromCategoryColor, defaultAppearance } from '../../lib/section-theme';
import { Button } from '../../components/ui/Button';
import { cacheLocalImageAsset } from '../../lib/cache-cover';

const MODES: Array<{ value: MotionMode; label: string; description: string }> = [
  { value: 'system', label: 'Sistema', description: 'Sigue la preferencia de movimiento del sistema.' },
  { value: 'full', label: 'Arcade completo', description: 'Destellos y celebraciones expresivas.' },
  { value: 'reduced', label: 'Reducido', description: 'Conserva solo el feedback esencial.' },
];

const BUILT_INS = [
  ['home', 'Inicio'], ['juegos', 'Juegos'], ['peliculas', 'Películas'], ['series', 'Series'],
  ['favoritos', 'Favoritos'], ['musica', 'Música'], ['calendario', 'Planes'], ['settings', 'Ajustes'],
] as const;

export function AppearanceSettingsPanel({ settings }: { settings: LocalSettings }) {
  const updateSettings = useUpdateSettings();
  const [section, setSection] = useState('home');
  const [draft, setDraft] = useState<SectionAppearance>(() => settings.sectionAppearances.home?.preset === 'custom' ? settings.sectionAppearances.home : defaultAppearance('home', undefined, settings.colorMode));
  const fileRef = useRef<HTMLInputElement>(null);
  const sectionOptions = [...BUILT_INS, ...settings.customCategories.map((category) => [category.id, category.label] as const)];
  const sectionDefault = useCallback((key: string) => defaultAppearance(key, accentFromCategoryColor(settings.customCategories.find((category) => category.id === key)?.colorHex), settings.colorMode), [settings.colorMode, settings.customCategories]);

  useEffect(() => { const configured = settings.sectionAppearances[section]; setDraft(configured?.preset === 'custom' ? configured : sectionDefault(section)); }, [section, sectionDefault, settings.sectionAppearances]);

  function saveAppearance(next = draft) {
    updateSettings.mutate({ sectionAppearances: { ...settings.sectionAppearances, [section]: { ...next, preset: 'custom' } } });
  }

  function selectBackground(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      window.dispatchEvent(new CustomEvent('app-error', { detail: 'La imagen de fondo supera los 5 MB.' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const background = await cacheLocalImageAsset(String(reader.result), 'backgrounds', file.name);
      setDraft((current) => ({ ...current, backgroundImagePath: background.resolvedUrl, backgroundImageStoragePath: background.storagePath, preset: 'custom' }));
    };
    reader.readAsDataURL(file);
  }

  const previewStyle = {
    backgroundImage: `${draft.backgroundImagePath ? `linear-gradient(rgba(0,0,0,${draft.dimPercent / 100}),rgba(0,0,0,${draft.dimPercent / 100})),url("${draft.backgroundImagePath}")` : `linear-gradient(145deg,${draft.gradientFrom},${draft.gradientTo})`}`,
    filter: `contrast(${draft.contrastPercent}%) saturate(${draft.saturationPercent}%)`,
  };

  return <div className="space-y-5">
    <section className="rounded-sm border border-noche-border bg-noche-surface p-5">
      <h2 className="font-semibold text-noche-text">Tema de la aplicación</h2>
      <p className="mt-1 text-sm text-noche-muted">Se aplica a los temas predeterminados. Tus personalizaciones por sección no cambian.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tema de la aplicación">
        <button role="radio" aria-checked={settings.colorMode === 'dark'} onClick={() => updateSettings.mutate({ colorMode: 'dark' })} className={`flex items-center justify-center gap-2 rounded-sm border p-3 text-sm font-semibold ${settings.colorMode === 'dark' ? 'border-[rgb(var(--theme-accent))] bg-noche-bg ring-1 ring-[rgb(var(--theme-accent))]' : 'border-noche-border bg-noche-bg'}`}><Moon size={17} /> Oscuro</button>
        <button role="radio" aria-checked={settings.colorMode === 'dark-flat'} onClick={() => updateSettings.mutate({ colorMode: 'dark-flat' })} className={`flex items-center justify-center gap-2 rounded-sm border p-3 text-sm font-semibold ${settings.colorMode === 'dark-flat' ? 'border-[rgb(var(--theme-accent))] bg-noche-bg ring-1 ring-[rgb(var(--theme-accent))]' : 'border-noche-border bg-noche-bg'}`}><PanelsTopLeft size={17} /> Oscuro plano</button>
        <button role="radio" aria-checked={settings.colorMode === 'light'} onClick={() => updateSettings.mutate({ colorMode: 'light' })} className={`flex items-center justify-center gap-2 rounded-sm border p-3 text-sm font-semibold ${settings.colorMode === 'light' ? 'border-[rgb(var(--theme-accent))] bg-noche-bg ring-1 ring-[rgb(var(--theme-accent))]' : 'border-noche-border bg-noche-bg'}`}><Sun size={17} /> Claro</button>
      </div>
    </section>
    <section className="rounded-sm border border-noche-border bg-noche-surface p-5">
      <h2 className="flex items-center gap-2 font-semibold text-noche-text"><Sparkles size={19} /> Movimiento</h2>
      <p className="mt-1 text-sm text-noche-muted">La preferencia de movimiento reducido del sistema siempre tiene prioridad.</p>
      <div role="radiogroup" aria-label="Movimiento" className="mt-4 grid gap-2 sm:grid-cols-3">{MODES.map((mode) => <button key={mode.value} role="radio" aria-checked={settings.motionMode === mode.value} onClick={() => updateSettings.mutate({ motionMode: mode.value })} className={`rounded-sm border p-3 text-left transition ${settings.motionMode === mode.value ? 'border-[rgb(var(--theme-accent))] bg-noche-bg ring-1 ring-[rgb(var(--theme-accent))]' : 'border-noche-border bg-noche-bg hover:border-noche-muted'}`}><span className="block text-sm font-semibold text-noche-text">{mode.label}</span><span className="text-xs text-noche-muted">{mode.description}</span></button>)}</div>
    </section>

    <section className="rounded-sm border border-noche-border bg-noche-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-noche-text">Tema por sección</h2><p className="text-sm text-noche-muted">Los filtros afectan solo el fondo; los controles conservan su contraste.</p></div><select value={section} onChange={(event) => setSection(event.target.value)} className="rounded-sm border border-noche-border bg-noche-bg px-3 py-2 text-sm text-noche-text">{sectionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>

      <div className="relative mt-4 h-36 overflow-hidden rounded-sm border border-noche-border bg-cover bg-center" style={previewStyle}>
        <div aria-hidden="true" className="absolute inset-0" style={{ backdropFilter: `blur(${draft.blurPx}px)` }} />
        <div className={`absolute inset-x-4 bottom-4 rounded-sm border p-3 shadow-xl backdrop-blur-md ${draft.dark ? 'border-white/15 bg-black/55 text-white' : 'border-black/10 bg-white/75 text-neutral-950'}`}><p className="font-title text-xs font-bold uppercase tracking-[0.22em]">Noite</p><p className="mt-1 text-sm">Vista previa de superficies y texto</p></div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ColorField label="Acento" value={draft.accent} onChange={(accent) => setDraft({ ...draft, accent, preset: 'custom' })} />
        <label className="flex items-center justify-between rounded-sm border border-noche-border bg-noche-bg px-3 py-2 text-sm text-noche-text">Superficies oscuras<input type="checkbox" checked={draft.dark} onChange={(event) => setDraft({ ...draft, dark: event.target.checked, preset: 'custom' })} /></label>
        <ColorField label="Inicio del degradado" value={draft.gradientFrom} onChange={(gradientFrom) => setDraft({ ...draft, gradientFrom, preset: 'custom' })} />
        <ColorField label="Final del degradado" value={draft.gradientTo} onChange={(gradientTo) => setDraft({ ...draft, gradientTo, preset: 'custom' })} />
        <RangeField label="Oscurecer" value={draft.dimPercent} min={0} max={90} unit="%" onChange={(dimPercent) => setDraft({ ...draft, dimPercent })} />
        <RangeField label="Desenfoque" value={draft.blurPx} min={0} max={24} unit="px" onChange={(blurPx) => setDraft({ ...draft, blurPx })} />
        <RangeField label="Contraste" value={draft.contrastPercent} min={75} max={125} unit="%" onChange={(contrastPercent) => setDraft({ ...draft, contrastPercent })} />
        <RangeField label="Saturación" value={draft.saturationPercent} min={0} max={160} unit="%" onChange={(saturationPercent) => setDraft({ ...draft, saturationPercent })} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => selectBackground(event.target.files)} />
      <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> {draft.backgroundImagePath ? 'Reemplazar imagen' : 'Elegir imagen'}</Button>{draft.backgroundImagePath && <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, backgroundImagePath: null, backgroundImageStoragePath: null })}><X size={15} /> Quitar imagen</Button>}<Button size="sm" variant="ghost" onClick={() => { const value = sectionDefault(section); setDraft(value); updateSettings.mutate({ sectionAppearances: { ...settings.sectionAppearances, [section]: value } }); }}><RotateCcw size={15} /> Restaurar</Button><Button size="sm" className="ml-auto" disabled={updateSettings.isPending} onClick={() => saveAppearance()}><Save size={15} /> Guardar tema</Button></div>
    </section>

    <section className="rounded-sm border border-noche-border bg-noche-surface p-5">
      <h2 className="flex items-center gap-2 font-semibold text-noche-text"><Volume2 size={18} /> Sonido</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Toggle label="Efectos de interfaz" checked={settings.audioSettings.sfxEnabled} onChange={(sfxEnabled) => updateSettings.mutate({ audioSettings: { ...settings.audioSettings, sfxEnabled } })} />
        <Toggle label="Ambiente de la pantalla de título" checked={settings.audioSettings.titleAmbienceEnabled} onChange={(titleAmbienceEnabled) => updateSettings.mutate({ audioSettings: { ...settings.audioSettings, titleAmbienceEnabled } })} />
        <RangeField label="Volumen de efectos" value={Math.round(settings.audioSettings.sfxVolume * 100)} min={0} max={100} unit="%" onChange={(value) => updateSettings.mutate({ audioSettings: { ...settings.audioSettings, sfxVolume: value / 100 } })} />
        <RangeField label="Volumen de ambiente" value={Math.round(settings.audioSettings.ambienceVolume * 100)} min={0} max={100} unit="%" onChange={(value) => updateSettings.mutate({ audioSettings: { ...settings.audioSettings, ambienceVolume: value / 100 } })} />
      </div>
    </section>
  </div>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="flex items-center justify-between rounded-sm border border-noche-border bg-noche-bg px-3 py-2 text-sm text-noche-text">{label}<span className="flex items-center gap-2"><code className="text-xs text-noche-muted">{value}</code><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /></span></label>; }
function RangeField({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) { return <label className="rounded-sm border border-noche-border bg-noche-bg px-3 py-2 text-xs font-semibold text-noche-muted"><span className="flex justify-between"><span>{label}</span><output>{value}{unit}</output></span><input className="mt-2 w-full accent-[rgb(var(--theme-accent))]" type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center justify-between rounded-sm border border-noche-border bg-noche-bg px-3 py-3 text-sm text-noche-text">{label}<input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
