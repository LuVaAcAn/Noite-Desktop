import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Camera, Database, FolderOpen, Gamepad2, HardDrive, HelpCircle, Link2, LockKeyhole, Music2, Palette, Pencil, Plus, Trash2, Upload, UserRound, Download, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORY_COLOR_PRESETS, EMOJI_CHOICES, categoryTextColor, isSingleEmoji, type ImportPreview } from '@proyecto-noche/domain';
import { AppShell } from '../../components/ui/AppShell';
import { ScrollRegion } from '../../components/ui/ScrollRegion';
import { Button } from '../../components/ui/Button';
import { settingsRepository } from '../../lib/repositories';
import { chooseNativeArchiveExportPath, chooseNativeArchiveImportPath, exportNativeArchiveToPath, importNativeArchivePath, listNativeBackups, openNativeArchiveFolder, previewNativeArchivePath, restoreNativeBackup, type NativeArchivePreview, type NativeBackupInfo } from '../../lib/native-persistence';
import {
  useAddCategory,
  useExportData,
  useImportData,
  usePreviewImport,
  useRemoveCategory,
  useSettings,
  useUpdateCategory,
  useUpdateSettings,
} from '../../hooks/use-settings';
import { ControllerSettingsPanel } from './ControllerSettingsPanel';
import { ArchiveSettingsPanel } from './ArchiveSettingsPanel';
import { AppearanceSettingsPanel } from './AppearanceSettingsPanel';
import { cacheLocalImageAsset } from '../../lib/cache-cover';
import { PasswordVaultPanel } from './PasswordVaultPanel';
import { clearRegenerableCache, factoryReset, previewRegenerableCache } from '../../lib/native-data-management';
import { ModalPortal } from '../../components/ui/Overlay';
import { CoverApiSettingsPanel } from './CoverApiSettingsPanel';
import { CoupleTransferTutorial } from './CoupleTransferTutorial';
import { CoupleNamesPanel } from './CoupleNamesPanel';
import { DevicePersonPanel } from './DevicePersonPanel';
import { profileRoleForId, profileDisplayName } from '@proyecto-noche/domain';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { blobDataUrl } from '../../lib/blob-data-url';
import { openExternal } from '../../lib/system-status';

export function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section') ?? 'profile';
  const section = ['profile', 'appearance', 'games', 'music', 'covers', 'passwords', 'controllers', 'archive', 'data', 'credits'].includes(requestedSection) ? requestedSection : 'profile';
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const addCategory = useAddCategory();
  const updateCategory = useUpdateCategory();
  const removeCategory = useRemoveCategory();
  const exportData = useExportData();
  const importData = useImportData();
  const previewImport = usePreviewImport();
  const importInputRef = useRef<HTMLInputElement>(null);
  const userAvatarInputRef = useRef<HTMLInputElement>(null);

  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<string>(EMOJI_CHOICES[0]);
  const [newCategoryColor, setNewCategoryColor] = useState<string>(CATEGORY_COLOR_PRESETS[0]);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ kind: 'json'; contents: string; preview: ImportPreview } | { kind: 'archive'; path: string; password: string; preview: NativeArchivePreview } | null>(null);
  const [exportDraft, setExportDraft] = useState<{ path: string; password: string; confirm: string } | null>(null);
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState<{ path: string; password: string; error?: string } | null>(null);
  const [importAcknowledged, setImportAcknowledged] = useState(false);
  const [coupleConfirmed, setCoupleConfirmed] = useState(false);

  useEffect(() => { setCoupleConfirmed(false); setImportAcknowledged(false); setReplaceConfirmation(''); }, [pendingImport]);
  const [replaceConfirmation, setReplaceConfirmation] = useState('');
  const [transferTutorialOpen, setTransferTutorialOpen] = useState(false);
  const [pendingCategoryRemoval, setPendingCategoryRemoval] = useState<{ id: string; label: string; count: number } | null>(null);
  const [nativeBackups, setNativeBackups] = useState<NativeBackupInfo[]>([]);
  const [restoreBackup, setRestoreBackup] = useState<NativeBackupInfo | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [cachePreview, setCachePreview] = useState<{ removedFiles: number; removedBytes: number } | null>(null);

  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) { void listNativeBackups().then(setNativeBackups).catch(() => undefined); void previewRegenerableCache().then(setCachePreview).catch(() => undefined); }
  }, []);

  const settings = settingsQuery.data;
  const isPartner = settings ? profileRoleForId(settings, settings.activeProfileId) === 'partner' : false;
  const replaceWord = settings?.locale === 'en' ? 'REPLACE' : 'REEMPLAZAR';

  async function handleExport() {
    if ('__TAURI_INTERNALS__' in window) {
      const path = await chooseNativeArchiveExportPath();
      if (path) setExportDraft({ path, password: '', confirm: '' });
      return;
    }
    const backup = await exportData.mutateAsync();
    const blob = new Blob([backup.contents], { type: 'application/x-proyecto-noche' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backup.suggestedFileName;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const prefix = await file.slice(0, 128).text();
    if (!file.name.toLowerCase().endsWith('.noche')) {
      setImportMessage('Noite solo acepta archivos .noche; no uses ZIP, JSON ni cambies la extensión.');
      e.target.value = '';
      return;
    }
    const nativeArchive = '__TAURI_INTERNALS__' in window && !prefix.trimStart().startsWith('{');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (nativeArchive) {
          setImportMessage('Usa el selector nativo para abrir respaldos cifrados de Noite.');
        } else {
          const json = reader.result as string;
          const preview = await previewImport.mutateAsync(json);
          setPendingImport({ kind: 'json', contents: json, preview });
        }
      } catch (err) {
        setImportMessage(err instanceof Error ? `Error al importar: ${err.message}` : 'Error al importar');
      }
    };
    if (nativeArchive) reader.readAsDataURL(file); else reader.readAsText(file);
    e.target.value = '';
  }

  async function beginNativeImport() {
    const path = await chooseNativeArchiveImportPath();
    if (path) setImportDraft({ path, password: '' });
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 12 * 1024 * 1024) { setAvatarError('La foto supera los 12 MB permitidos.'); return; }
    const supportedExtension = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase()) && !supportedExtension) { setAvatarError('Usa una imagen JPG, PNG o WebP. HEIC todavía no es compatible.'); return; }
    const preview = URL.createObjectURL(file); setAvatarPreview(preview); setAvatarBusy(true); setAvatarError(null);
    try {
      const avatar = await cacheLocalImageAsset(await blobDataUrl(file), 'profiles', file.name);
      await updateSettings.mutateAsync(isPartner ? { partnerAvatarUrl: avatar.resolvedUrl, partnerAvatarPath: avatar.storagePath } : { userAvatarUrl: avatar.resolvedUrl, userAvatarPath: avatar.storagePath });
    } catch (cause) { setAvatarError(cause instanceof Error ? cause.message : 'No se pudo preparar la imagen.'); }
    finally { setAvatarBusy(false); setAvatarPreview(null); URL.revokeObjectURL(preview); }
  }

  return (
    <AppShell showBack>
      <div className="grid h-full min-h-0 grid-cols-[150px_minmax(0,1fr)] gap-3 overflow-hidden px-[var(--shell-gutter)] py-[var(--content-pad-y)] md:grid-cols-[210px_minmax(0,1fr)] md:gap-5">
        <aside aria-label="Secciones de ajustes" className="overflow-y-auto rounded-2xl border border-noche-border bg-noche-surface p-3 overscroll-contain">
          <h1 className="mb-3 px-3 pt-2 font-display text-xl font-bold text-noche-text">Ajustes</h1>
          {[{ id: 'profile', label: 'Perfil', icon: UserRound }, { id: 'appearance', label: 'Apariencia', icon: Palette }, { id: 'games', label: 'Juegos instalados', icon: HardDrive }, { id: 'music', label: 'Música', icon: Music2 }, { id: 'covers', label: 'Portadas', icon: Link2 }, { id: 'passwords', label: 'Contraseñas', icon: LockKeyhole }, { id: 'controllers', label: 'Controles', icon: Gamepad2 }, { id: 'archive', label: 'Archivo', icon: ArchiveRestore }, { id: 'data', label: 'Datos', icon: Database }, { id: 'credits', label: 'Créditos', icon: HelpCircle }].map((item) => { const Icon = item.icon; return <button key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSearchParams({ section: item.id })} className={`mb-1 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition ${section === item.id ? 'border-[rgb(var(--theme-accent))] bg-[rgb(var(--theme-accent)/.14)] text-noche-text' : 'border-transparent text-noche-muted hover:bg-noche-bg hover:text-noche-text'}`}><Icon size={16} />{item.label}</button>; })}
        </aside>
      <ScrollRegion as="div" label="Panel de ajustes" className="app-route-content pr-2">
      <main className="mx-auto max-w-3xl">
        {settings && (
          <section className={`${section === 'profile' ? '' : 'hidden'} mb-6 rounded-2xl border border-noche-border bg-noche-surface p-6`}>
            <h2 className="mb-4 font-semibold text-noche-text">Perfil</h2>

            <div className="mb-5 flex items-center gap-4">
              <button
                onClick={() => userAvatarInputRef.current?.click()}
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-pink-400 via-fuchsia-500 to-orange-300"
              >
                <ProfileAvatar name={profileDisplayName(settings, settings.activeProfileId)} src={avatarPreview ?? (isPartner ? settings.partnerAvatarUrl : settings.userAvatarUrl)} className="h-full w-full text-xl" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                  <Camera size={18} />
                </span>
              </button>
              <div>
                <p className="text-sm font-medium text-noche-text">Foto de perfil</p>
                <p className="text-xs text-noche-muted">{avatarBusy ? 'Preparando imagen…' : 'Tu foto, independiente de la de tu pareja.'}</p>
                {avatarError && <p role="alert" className="mt-1 text-xs text-red-500">{avatarError}</p>}
              </div>
              <input ref={userAvatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(event) => void handleAvatarFile(event)} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-noche-muted">Nombre del espacio</label>
                <input
                  defaultValue={settings.spaceName}
                  onBlur={(e) => updateSettings.mutate({ spaceName: e.target.value.trim() || 'Nuestro espacio' })}
                  className="w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-2.5 text-noche-text focus:border-pink-500"
                />
                <p className="mt-1.5 text-sm text-noche-muted">
                  Este nombre identifica el espacio en Inicio, respaldos y recuerdos.
                </p>
              </div>
              <div className="sm:col-span-2"><CoupleNamesPanel key={`${settings.userName}\u0000${settings.partnerName}`} settings={settings} onSave={(names) => updateSettings.mutateAsync(names)} /><DevicePersonPanel key={settings.activeProfileId} settings={settings} /></div>
              <div className="sm:col-span-2"><label className="mb-1.5 block text-sm font-medium text-noche-muted">Idioma del perfil</label><select value={settings.locale} onChange={(event) => updateSettings.mutate({ locale: event.target.value as 'es' | 'en' })} className="w-full rounded-xl border border-noche-border bg-noche-bg px-4 py-2.5 text-noche-text"><option value="es">Español</option><option value="en">English</option></select></div>
            </div>
          </section>
        )}

        <section className={`${section === 'profile' ? '' : 'hidden'} mb-6 rounded-2xl border border-noche-border bg-noche-surface p-6`}>
          <h2 className="mb-4 font-semibold text-noche-text">Categorías personalizadas</h2>
          <p className="mb-4 text-sm text-noche-muted">
            Además de Juegos, Películas y Series, agrega tus propias categorías: lecturas, viajes, recetas…
          </p>

          <ul className="mb-4 space-y-2">
            {settings?.customCategories.map((category) => (
              <li
                key={category.id}
                className="flex items-center justify-between rounded-xl bg-noche-bg px-4 py-2.5"
              >
                <span className="flex items-center gap-2 text-sm text-noche-text">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm" style={{ backgroundColor: category.colorHex, color: categoryTextColor(category.colorHex) }}>
                    {category.icon}
                  </span>
                  {category.label}
                </span>
                <span className="flex items-center gap-1">
                  <button aria-label={`Editar ${category.label}`} onClick={() => { setEditingCategoryId(category.id); setNewCategoryLabel(category.label); setNewCategoryIcon(category.icon); setNewCategoryColor(category.colorHex); setCategoryMessage(null); }} className="rounded-full p-2 text-noche-muted hover:bg-noche-surface hover:text-noche-text"><Pencil size={14} /></button>
                  <button
                    aria-label="Eliminar categoría"
                    onClick={async () => setPendingCategoryRemoval({
                      id: category.id,
                      label: category.label,
                      count: await settingsRepository.categoryUsage(category.id),
                    })}
                    className="rounded-full p-2 text-noche-muted hover:bg-noche-surface hover:text-red-400"
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </li>
            ))}
            {settings?.customCategories.length === 0 && (
              <li className="text-sm text-noche-muted">Todavía no agregaste ninguna.</li>
            )}
          </ul>

          <div className="space-y-3 rounded-xl bg-noche-bg p-4">
            <input
              value={newCategoryLabel}
              onChange={(e) => setNewCategoryLabel(e.target.value)}
              placeholder="Nombre, ej. Recetas"
              maxLength={40}
              className="w-full rounded-xl border border-noche-border bg-noche-surface px-3 py-2 text-sm text-noche-text focus:border-pink-500"
            />

            {/* Punto 3 del feedback: solo emojis, muchas opciones, sin
                nombres de texto al lado. */}
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
              {EMOJI_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={emoji}
                  onClick={() => setNewCategoryIcon(emoji)}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition hover:bg-noche-surface-hover ${
                    newCategoryIcon === emoji ? 'bg-noche-surface ring-2 ring-pink-400' : ''
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <label className="block text-xs font-semibold text-noche-muted">Emoji personalizado
              <input value={newCategoryIcon} onChange={(event) => { setNewCategoryIcon(event.target.value); setCategoryMessage(null); }} placeholder="✨" className="mt-1.5 w-24 rounded-xl border border-noche-border bg-noche-surface px-3 py-2 text-center text-xl text-noche-text" />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {CATEGORY_COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    aria-label={color}
                    onClick={() => setNewCategoryColor(color)}
                    className={`h-7 w-7 rounded-full ${newCategoryColor === color ? 'ring-2 ring-offset-2 ring-offset-noche-bg ring-noche-text' : ''}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <label className="ml-1 inline-flex items-center gap-2 text-xs text-noche-muted">Personalizado <input aria-label="Color personalizado" type="color" value={newCategoryColor} onChange={(event) => setNewCategoryColor(event.target.value.toUpperCase())} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent" /></label>
              </div>
              <div className="flex gap-2">
                {editingCategoryId && <Button size="sm" variant="ghost" onClick={() => { setEditingCategoryId(null); setNewCategoryLabel(''); setNewCategoryIcon(EMOJI_CHOICES[0]); setNewCategoryColor(CATEGORY_COLOR_PRESETS[0]); setCategoryMessage(null); }}><X size={14} /> Cancelar</Button>}
                <Button
                  size="sm"
                  disabled={!newCategoryLabel.trim() || !isSingleEmoji(newCategoryIcon) || addCategory.isPending || updateCategory.isPending}
                  onClick={async () => {
                    setCategoryMessage(null);
                    try {
                      const input = { label: newCategoryLabel.trim(), icon: newCategoryIcon, colorHex: newCategoryColor };
                      if (editingCategoryId) await updateCategory.mutateAsync({ id: editingCategoryId, ...input });
                      else await addCategory.mutateAsync(input);
                      setEditingCategoryId(null); setNewCategoryLabel(''); setNewCategoryIcon(EMOJI_CHOICES[0]); setNewCategoryColor(CATEGORY_COLOR_PRESETS[0]);
                    } catch (cause) { setCategoryMessage(cause instanceof Error ? cause.message : 'No se pudo guardar la categoría.'); }
                  }}
                >
                  {editingCategoryId ? <><Pencil size={14} /> Guardar cambios</> : <><Plus size={14} /> Agregar</>}
                </Button>
              </div>
            </div>
            {categoryMessage && <p role="alert" className="text-sm text-red-500">{categoryMessage}</p>}
          </div>
        </section>

        {settings && section === 'appearance' && <AppearanceSettingsPanel settings={settings} />}
        {section === 'games' && <section className="rounded-2xl border border-noche-border bg-noche-surface p-6"><HardDrive className="text-[rgb(var(--theme-accent))]" /><h2 className="mt-3 font-semibold text-noche-text">Juegos instalados en esta PC</h2><p className="mt-2 text-sm leading-6 text-noche-muted">Revisa Steam, Epic, GOG, Xbox, EA, Ubisoft y Battle.net. Los destinos de lanzamiento permanecen locales y los nuevos títulos siempre se revisan antes de importarlos.</p><Button className="mt-5" onClick={() => navigate('/juegos/instalados')}>Escanear o revisar juegos</Button></section>}
        {section === 'credits' && <section className="space-y-5 rounded-2xl border border-noche-border bg-noche-surface p-6"><div><h2 className="font-semibold text-noche-text">Créditos y proveedores</h2><p className="mt-1 text-sm leading-6 text-noche-muted">La búsqueda opcional de portadas usa tus credenciales locales de TMDB o IGDB. Configúralas en Portadas; también puedes importar una imagen.</p></div><div className="rounded-xl border border-noche-border bg-noche-bg p-4"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg" alt="The Movie Database (TMDB)" className="h-5 w-auto" /><p className="mt-3 text-sm text-noche-muted">This product uses the TMDB API but is not endorsed or certified by TMDB.</p><button type="button" className="mt-2 inline-block text-sm text-[rgb(var(--theme-accent))] underline" onClick={() => void openExternal('https://www.themoviedb.org')}>The Movie Database</button></div><div className="rounded-xl border border-noche-border bg-noche-bg p-4"><p className="font-semibold text-noche-text">IGDB</p><p className="mt-2 text-sm text-noche-muted">Información de videojuegos proporcionada por IGDB, un servicio de Twitch.</p><button type="button" className="mt-2 inline-block text-sm text-[rgb(var(--theme-accent))] underline" onClick={() => void openExternal('https://www.igdb.com')}>Internet Game Database</button></div></section>}
        {settings && section === 'controllers' && <ControllerSettingsPanel settings={settings} />}
        {section === 'archive' && <ArchiveSettingsPanel />}
        {section === 'music' && <section className="rounded-[14px] border border-noche-border bg-noche-surface p-6"><h2 className="font-semibold text-noche-text">Enlaces de Spotify</h2><p className="mt-2 text-sm text-noche-muted">Pega enlaces oficiales y asócialos a recuerdos sin conectar cuentas, contraseñas ni dispositivos.</p><Button className="mt-4" onClick={() => navigate('/musica')}>Abrir Música</Button></section>}
        {section === 'covers' && <CoverApiSettingsPanel />}
        {section === 'passwords' && settings && <PasswordVaultPanel key={settings.activeProfileId} actorId={profileRoleForId(settings, settings.activeProfileId)} actorName={profileDisplayName(settings, settings.activeProfileId)} avatarUrl={profileRoleForId(settings, settings.activeProfileId) === 'me' ? settings.userAvatarUrl : settings.partnerAvatarUrl} />}

        <section className={`${section === 'data' ? '' : 'hidden'} mb-6 rounded-2xl border border-noche-border bg-noche-surface p-6`}>
          <div className="mb-2 flex items-center justify-between gap-3"><h2 className="font-semibold text-noche-text">Respaldos y transferencia</h2><Button variant="ghost" size="sm" aria-label="Ayuda para compartir datos en pareja" title="Cómo compartir datos en pareja" onClick={() => setTransferTutorialOpen(true)}><HelpCircle size={20} aria-hidden="true" /> Ayuda para parejas</Button></div>
          <p className="mb-4 text-sm text-noche-muted">
            Crea una copia de esta computadora o abre un archivo .noche recibido. Comparte el archivo con la otra persona para transferir los cambios.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" size="sm" onClick={handleExport} disabled={exportData.isPending}>
              <Download size={14} /> Crear respaldo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => '__TAURI_INTERNALS__' in window ? void beginNativeImport() : importInputRef.current?.click()}>
              <Upload size={14} /> Abrir respaldo
            </Button>
            <input ref={importInputRef} type="file" accept=".noche,application/x-noite" className="hidden" onChange={handleImportFile} />
          </div>
          {exportedPath && <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-noche-text"><p>Respaldo guardado en:</p><p className="mt-1 break-all font-mono text-xs text-noche-muted">{exportedPath}</p><Button className="mt-3" size="sm" variant="ghost" onClick={() => void openNativeArchiveFolder(exportedPath)}><FolderOpen size={14} /> Abrir carpeta</Button></div>}
          <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-6 text-noche-text">El respaldo completo puede incluir bóveda y credenciales privadas. Abrirlo permite revisar su contenido antes de confirmar; importarlo reemplaza datos, no combina bibliotecas. Antes de recibir una copia de tu pareja, guarda la tuya en otro archivo.</p>
          {nativeBackups[0] && (
            <button className="mt-3 text-sm text-noche-muted underline hover:text-noche-text" onClick={() => setRestoreBackup(nativeBackups[0])}>
              Restaurar respaldo automático del {new Date(nativeBackups[0].createdAt).toLocaleString('es-PE')}
            </button>
          )}
          {importMessage && <p className="mt-3 text-sm text-noche-muted">{importMessage}</p>}
          <div className="mt-6 border-t border-noche-border pt-5"><h3 className="font-semibold text-red-600">Borrar todos los datos de Noite</h3><p className="mt-1 text-sm leading-6 text-noche-muted">Elimina actividades, recuerdos, medios, respaldos automáticos, API keys, los perfiles y los dos almacenes de contraseñas. Los archivos .noche exportados fuera de la aplicación no se modifican.</p><Button className="mt-4" variant="ghost" size="sm" onClick={() => { setResetConfirmation(''); setResetError(null); setResetOpen(true); }}><Trash2 size={14} /> Borrar todos los datos</Button></div>
          <div className="mt-6 border-t border-noche-border pt-5"><h3 className="font-semibold text-noche-text">Caché local</h3><p className="mt-1 text-sm text-noche-muted">Elimina archivos temporales y medios huérfanos sin tocar actividades, cola offline, bóveda, audio ni respaldos.</p>{cachePreview && <p className="mt-2 text-xs text-noche-muted">Se pueden liberar {(cachePreview.removedBytes / 1024 / 1024).toFixed(1)} MiB en {cachePreview.removedFiles} archivos.</p>}<Button className="mt-3" variant="ghost" size="sm" disabled={cachePreview?.removedFiles === 0} onClick={() => void clearRegenerableCache().then((result) => { setCachePreview({ removedFiles: 0, removedBytes: 0 }); setCacheMessage(`Se liberaron ${(result.removedBytes / 1024 / 1024).toFixed(1)} MiB en ${result.removedFiles} archivos.`); }).catch((cause) => setCacheMessage(cause instanceof Error ? cause.message : 'No se pudo limpiar la caché.'))}>Limpiar caché</Button>{cacheMessage && <p className="mt-2 text-xs text-noche-muted">{cacheMessage}</p>}</div>
        </section>

        {resetOpen && <ModalPortal onClose={() => setResetOpen(false)}><div role="dialog" aria-modal="true" aria-labelledby="factory-reset-title" className="fixed inset-0 z-[85] grid place-items-center overflow-y-auto bg-black/70 p-4"><div className="w-full max-w-lg rounded-2xl bg-noche-surface p-6 shadow-2xl"><h2 id="factory-reset-title" className="text-lg font-semibold text-noche-text">Restablecer Noite por completo</h2><p className="mt-2 text-sm leading-6 text-noche-muted">Esta eliminación lógica no se puede deshacer y no garantiza borrado forense en unidades SSD. La aplicación volverá a la configuración inicial.</p><label className="mt-4 block text-sm text-noche-muted">Escribe <strong>ELIMINAR NOITE</strong><input autoFocus value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-3 py-2 text-noche-text" /></label>{resetError && <p role="alert" className="mt-3 text-sm text-red-500">{resetError}</p>}<div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setResetOpen(false)}>Cancelar</Button><Button disabled={resetConfirmation !== 'ELIMINAR NOITE' || resetting} onClick={async () => { setResetting(true); setResetError(null); try { await factoryReset(resetConfirmation); window.location.replace('/'); } catch (cause) { setResetError(typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : 'No se pudieron borrar todos los datos.'); setResetting(false); } }}>{resetting ? 'Borrando…' : 'Borrar y reiniciar'}</Button></div></div></div></ModalPortal>}

        <ModalPortal onClose={() => setPendingCategoryRemoval(null)}>
        {pendingCategoryRemoval && (
          <div role="dialog" aria-modal="true" aria-labelledby="remove-category-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-noche-surface p-6 shadow-2xl">
              <h2 id="remove-category-title" className="font-semibold text-noche-text">Eliminar “{pendingCategoryRemoval.label}”</h2>
              <p className="mt-2 text-sm text-noche-muted">{pendingCategoryRemoval.count > 0 ? `${pendingCategoryRemoval.count} actividades pasarán a “Otro”. No se borrará ningún recuerdo.` : 'La categoría está vacía.'}</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPendingCategoryRemoval(null)}>Cancelar</Button>
                <Button size="sm" onClick={async () => { await removeCategory.mutateAsync(pendingCategoryRemoval.id); setPendingCategoryRemoval(null); }}>Eliminar categoría</Button>
              </div>
            </div>
          </div>
        )}

        </ModalPortal>
        <ModalPortal onClose={() => setPendingImport(null)}>
        {pendingImport && (
          <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4">
            <div className="my-auto w-full max-w-md rounded-2xl bg-noche-surface p-6 shadow-2xl">
              <h2 id="import-title" className="font-semibold text-noche-text">Revisar respaldo</h2>
              <div className="mt-3 rounded-xl border border-noche-border bg-noche-bg p-3 text-sm text-noche-text">
                <p>En este equipo: {settings?.userName || 'Sin nombre'} y {settings?.partnerName || 'Sin pareja configurada'}.</p>
                <p>En el respaldo: {pendingImport.preview.manifest.coupleNames?.map((name) => name || 'Sin nombre').join(' y ') || 'Este archivo antiguo no informa los nombres. Verifícalos con quien lo envió antes de continuar.'}</p>
                <p className="mt-2 text-noche-muted">Se usarán los nombres del respaldo. No se intercambian personas ni se reasignan ideas automáticamente.</p>
                <label className="mt-3 flex gap-2"><input type="checkbox" checked={coupleConfirmed} onChange={(e) => setCoupleConfirmed(e.target.checked)} />Confirmo que este respaldo corresponde a nuestra pareja y he verificado ambos nombres.</label>
              </div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-noche-muted">Formato v{pendingImport.preview.manifest.version}{pendingImport.preview.manifest.exportedAt ? ` · ${new Date(pendingImport.preview.manifest.exportedAt).toLocaleString('es-PE')}` : ''}</p>
              <p className="mt-2 text-sm text-noche-muted">Se importarán {pendingImport.preview.manifest.counts.libraryItems} actividades, {pendingImport.preview.manifest.counts.plans} planes, {pendingImport.preview.manifest.counts.reviews} reseñas y {pendingImport.preview.manifest.counts.attachments} imágenes.</p>
              <div className="mt-4 rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-noche-text"><strong>Esto reemplazará todos los datos compartidos actuales.</strong><p className="mt-1 text-xs text-noche-muted">Los cambios que todavía no respaldaste pueden perderse. Noite creará un respaldo automático del estado actual antes del reemplazo.</p><label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" checked={importAcknowledged} onChange={(event) => setImportAcknowledged(event.target.checked)} /><span>Entiendo que los datos locales serán reemplazados y quiero continuar.</span></label></div>
              <label className="mt-4 block text-sm text-noche-muted">{settings?.locale === 'en' ? 'For the second confirmation, type' : 'Para confirmar por segunda vez, escribe'} <strong className="text-noche-text">{replaceWord}</strong><input value={replaceConfirmation} onChange={(event) => setReplaceConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-3 py-2 text-noche-text" /></label>
              {pendingImport.kind === 'archive' && <p className="mt-2 text-xs text-noche-muted">El archivo incluye {pendingImport.preview.manifest.counts.mediaFiles} medios guardados{pendingImport.preview.manifest.counts.passwordVaultEntries ? ` y ${pendingImport.preview.manifest.counts.passwordVaultEntries} entradas de contraseñas cifradas` : ''}.</p>}
              {pendingImport.preview.warnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-amber-700">{pendingImport.preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
              <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>Cancelar</Button>
                <Button size="sm" disabled={importData.isPending || !coupleConfirmed || !importAcknowledged || replaceConfirmation !== replaceWord} onClick={async () => { if (!coupleConfirmed) return; if (pendingImport.kind === 'archive') { await importNativeArchivePath(pendingImport.path, pendingImport.password); window.location.reload(); } else { await importData.mutateAsync(pendingImport.contents); setPendingImport(null); setImportMessage('Datos importados correctamente.'); } }}>{settings?.locale === 'en' ? 'Replace data' : 'Reemplazar datos'}</Button>
              </div>
            </div>
          </div>
        )}
        </ModalPortal>
        <ModalPortal onClose={() => setExportDraft(null)}>
        {exportDraft && <div role="dialog" aria-modal="true" aria-labelledby="export-backup-title" className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4"><form className="w-full max-w-md rounded-2xl border border-noche-border bg-noche-surface p-6 shadow-2xl" onSubmit={async (event) => { event.preventDefault(); if (exportDraft.password.length < 12 || exportDraft.password !== exportDraft.confirm) return; const result = await exportNativeArchiveToPath(exportDraft.path, exportDraft.password); setExportedPath(result.path); setExportDraft(null); }}><h2 id="export-backup-title" className="font-semibold text-noche-text">Cifrar respaldo de Noite</h2><p className="mt-2 text-sm leading-6 text-noche-muted">Elige una contraseña de al menos 12 caracteres. Se necesitará para importar el archivo y no puede recuperarse.</p><label className="mt-4 block text-sm text-noche-muted">Contraseña<input autoFocus type="password" autoComplete="new-password" value={exportDraft.password} onChange={(event) => setExportDraft({ ...exportDraft, password: event.target.value })} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-3 py-2 text-noche-text" /></label><label className="mt-3 block text-sm text-noche-muted">Confirmar contraseña<input type="password" autoComplete="new-password" value={exportDraft.confirm} onChange={(event) => setExportDraft({ ...exportDraft, confirm: event.target.value })} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-3 py-2 text-noche-text" /></label>{exportDraft.password && exportDraft.password.length < 12 && <p className="mt-2 text-xs text-amber-600">Usa al menos 12 caracteres.</p>}{exportDraft.confirm && exportDraft.password !== exportDraft.confirm && <p className="mt-2 text-xs text-red-500">Las contraseñas no coinciden.</p>}<p className="mt-3 break-all text-xs text-noche-muted">Se guardará en {exportDraft.path}</p><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setExportDraft(null)}>Cancelar</Button><Button type="submit" disabled={exportDraft.password.length < 12 || exportDraft.password !== exportDraft.confirm}>Guardar respaldo</Button></div></form></div>}
        </ModalPortal>
        <ModalPortal onClose={() => setImportDraft(null)}>
        {importDraft && <div role="dialog" aria-modal="true" aria-labelledby="unlock-backup-title" className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4"><form className="w-full max-w-md rounded-2xl border border-noche-border bg-noche-surface p-6 shadow-2xl" onSubmit={async (event) => { event.preventDefault(); try { const preview = await previewNativeArchivePath(importDraft.path, importDraft.password); setImportAcknowledged(false); setReplaceConfirmation(''); setPendingImport({ kind: 'archive', path: importDraft.path, password: importDraft.password, preview }); setImportDraft(null); } catch (cause) { setImportDraft({ ...importDraft, error: cause instanceof Error ? cause.message : 'La contraseña es incorrecta o el respaldo no es válido.' }); } }}><h2 id="unlock-backup-title" className="font-semibold text-noche-text">Abrir respaldo de Noite</h2><p className="mt-2 break-all text-xs text-noche-muted">{importDraft.path}</p><label className="mt-4 block text-sm text-noche-muted">Contraseña del respaldo<input autoFocus type="password" autoComplete="current-password" value={importDraft.password} onChange={(event) => setImportDraft({ ...importDraft, password: event.target.value, error: undefined })} className="mt-1.5 w-full rounded-xl border border-noche-border bg-noche-bg px-3 py-2 text-noche-text" /></label>{importDraft.error && <p role="alert" className="mt-3 text-sm text-red-500">{importDraft.error}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setImportDraft(null)}>Cancelar</Button><Button type="submit">Revisar contenido</Button></div></form></div>}
        </ModalPortal>
        <ModalPortal onClose={() => setTransferTutorialOpen(false)}>
        {transferTutorialOpen && <CoupleTransferTutorial onClose={() => setTransferTutorialOpen(false)} />}
        </ModalPortal>
        <ModalPortal onClose={() => setRestoreBackup(null)}>
        {restoreBackup && (
          <div role="dialog" aria-modal="true" aria-labelledby="restore-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-noche-surface p-6 shadow-2xl">
              <h2 id="restore-title" className="font-semibold text-noche-text">Restaurar respaldo automático</h2>
              <p className="mt-2 text-sm text-noche-muted">Se guardará una copia del estado actual y la aplicación se reiniciará con los datos seleccionados.</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setRestoreBackup(null)}>Cancelar</Button>
                <Button size="sm" onClick={async () => { await restoreNativeBackup(restoreBackup.id); window.location.reload(); }}>Restaurar</Button>
              </div>
            </div>
          </div>
        )}
        </ModalPortal>

      </main>
      </ScrollRegion>
      </div>
    </AppShell>
  );
}
