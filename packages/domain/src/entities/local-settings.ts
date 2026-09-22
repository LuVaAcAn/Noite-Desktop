// Perfiles y preferencias almacenados en este equipo.

export type ProfileId = string;
export type Locale = 'es' | 'en';
export type ProfileCredentialKind = 'pin' | 'password';
export type ProfileAccessMode = 'protected' | 'open' | 'setup_required';
export type AppColorMode = 'dark' | 'dark-flat' | 'light';
export type OnboardingStage = 'language' | 'auth' | 'appearance' | 'profile' | 'migration' | 'couple' | 'complete';
export type ProfileRole = 'primary' | 'partner';
export interface Profile { id: ProfileId; role: ProfileRole; displayName: string; locale: Locale; avatarUrl: string | null }
export interface ProfileAuthStatus { profileId: ProfileId; initialized: boolean; unlocked: boolean; accessMode: ProfileAccessMode; credentialKind: ProfileCredentialKind | null; locale: Locale; lockedUntil: string | null }
export interface EncryptedSharedSecrets { version: 1; nonce: string; ciphertext: string }
export type MotionMode = 'system' | 'full' | 'reduced';
export type AppEntryState = 'boot' | 'title' | 'player-select' | 'title-settings' | 'app';
export type SoundEvent = 'move' | 'confirm' | 'back' | 'dialog' | 'success' | 'error' | 'archive' | 'random' | 'controller';
export type ControllerFocusScope = 'status' | 'navigation' | 'recent' | 'content' | 'dialog' | 'gallery' | 'actions';
export interface ControllerHint { button: string; label: string }
export type SectionThemeKey = 'home' | 'juegos' | 'peliculas' | 'series' | 'favoritos' | 'musica' | 'calendario' | 'settings' | string;

export interface AudioSettings {
  sfxEnabled: boolean;
  sfxVolume: number;
  titleAmbienceEnabled: boolean;
  ambienceVolume: number;
}

export interface SectionAppearance {
  preset: 'default' | 'custom';
  accent: string;
  gradientFrom: string;
  gradientTo: string;
  backgroundImagePath: string | null;
  backgroundImageStoragePath?: string | null;
  dimPercent: number;
  blurPx: number;
  contrastPercent: number;
  saturationPercent: number;
  dark: boolean;
}
export type ControllerAction = 'confirm' | 'back' | 'menu' | 'up' | 'down' | 'left' | 'right' | 'previousSection' | 'nextSection';

export interface ControllerBinding {
  type: 'button';
  index: number;
}

export type ControllerMapping = Record<ControllerAction, ControllerBinding>;

export const DEFAULT_CONTROLLER_MAPPING: ControllerMapping = {
  confirm: { type: 'button', index: 0 },
  back: { type: 'button', index: 1 },
  menu: { type: 'button', index: 9 },
  up: { type: 'button', index: 12 },
  down: { type: 'button', index: 13 },
  left: { type: 'button', index: 14 },
  right: { type: 'button', index: 15 },
  previousSection: { type: 'button', index: 4 },
  nextSection: { type: 'button', index: 5 },
};

export interface CustomCategory {
  id: string;
  label: string;
  icon: string; // un emoji, ej. "🎲" — ver EMOJI_CHOICES
  /** Color persistido, independiente de las clases generadas por Tailwind. */
  colorHex: string;
}

// Paleta amplia para el selector de categorías personalizadas — solo el
// emoji, sin nombres en texto (punto 3 del feedback).
export const EMOJI_CHOICES = [
  '🎮', '🕹️', '🎲', '🃏', '🧩', '🎯', '🎪', '🎳',
  '🎬', '🎞️', '📺', '🍿', '🎭', '🎤', '🎧', '🎹',
  '🎸', '🥁', '🎺', '🎨', '🖌️', '📷', '📚', '📖',
  '📝', '🧵', '🪴', '🌸', '🌙', '⭐', '✨', '🔥',
  '☕', '🍕', '🍔', '🍜', '🍰', '🍷', '🍺', '🧁',
  '🏋️', '⚽', '🏀', '🎾', '🏊', '🚴', '🧗', '🏕️',
  '✈️', '🗺️', '🏖️', '🏔️', '🚗', '🎉', '🎁', '💌',
  '💝', '🛍️', '🧠', '🐾', '🌿', '🧘', '🌊', '❄️',
] as const;

export interface LocalSettings {
  localEditionVersion?: number;
  setupVersion: number;
  onboardingComplete: boolean;
  onboardingStage: OnboardingStage;
  spaceName: string;
  userName: string;
  partnerName: string;
  /** Foto de perfil de la pareja, como data URL — puramente decorativa. */
  userAvatarUrl: string | null;
  userAvatarPath: string | null;
  partnerAvatarUrl: string | null;
  partnerAvatarPath: string | null;
  profiles: Record<ProfileRole, Profile>;
  activeProfileId: ProfileId;
  locale: Locale;
  colorMode: AppColorMode;
  customCategories: CustomCategory[];
  motionMode: MotionMode;
  controllerNavigationEnabled: boolean;
  controllerDeadZone: number;
  controllerMapping: ControllerMapping;
  audioSettings: AudioSettings;
  sectionAppearances: Record<string, SectionAppearance>;
  lastUpdateCheckAt: string | null;
  dismissedUpdateVersion: string | null;
  automaticUpdateChecks: boolean;
}

export function profileIdForRole(settings: LocalSettings, role: 'me' | 'partner'): ProfileId {
  return role === 'me' ? settings.profiles.primary.id : settings.profiles.partner.id;
}

export function profileRoleForId(settings: LocalSettings, profileId: ProfileId): 'me' | 'partner' {
  return profileId === settings.profiles.partner.id ? 'partner' : 'me';
}

export function profileDisplayName(settings: LocalSettings, profileId: ProfileId): string {
  return profileRoleForId(settings, profileId) === 'me' ? settings.userName : settings.partnerName || 'Pareja';
}

const newProfileId = () => `profile-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const DEFAULT_PRIMARY_PROFILE_ID = newProfileId();
const DEFAULT_PARTNER_PROFILE_ID = newProfileId();

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  setupVersion: 0,
  onboardingComplete: false,
  onboardingStage: 'language',
  spaceName: 'Nuestro espacio',
  userName: '',
  partnerName: '',
  userAvatarUrl: null,
  userAvatarPath: null,
  partnerAvatarUrl: null,
  partnerAvatarPath: null,
  profiles: {
    primary: { id: DEFAULT_PRIMARY_PROFILE_ID, role: 'primary', displayName: '', locale: 'es', avatarUrl: null },
    partner: { id: DEFAULT_PARTNER_PROFILE_ID, role: 'partner', displayName: '', locale: 'es', avatarUrl: null },
  },
  activeProfileId: DEFAULT_PRIMARY_PROFILE_ID,
  locale: 'es',
  colorMode: 'light',
  localEditionVersion: 1,
  customCategories: [],
  motionMode: 'system',
  controllerNavigationEnabled: true,
  controllerDeadZone: 0.55,
  controllerMapping: DEFAULT_CONTROLLER_MAPPING,
  audioSettings: {
    sfxEnabled: true,
    sfxVolume: 0.35,
    titleAmbienceEnabled: true,
    ambienceVolume: 0.15,
  },
  sectionAppearances: {},
  lastUpdateCheckAt: null,
  dismissedUpdateVersion: null,
  automaticUpdateChecks: true,
};
