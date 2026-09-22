// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_LOCAL_SETTINGS } from '@proyecto-noche/domain';
import { PersistentAppShell } from './AppShell';
import { useUiStore } from '../../stores/ui-store';

const scan = vi.hoisted(() => ({ status: 'not_asked', skip: vi.fn() }));
vi.mock('../../hooks/use-settings', () => ({ useSettings: () => ({ data: { ...DEFAULT_LOCAL_SETTINGS, onboardingComplete: true } }) }));
vi.mock('../../hooks/use-game-discovery', () => ({ useGameScanStatus: () => ({ data: { status: scan.status } }), useSkipGameScan: () => ({ mutate: scan.skip, isPending: false }) }));
vi.mock('./AppHeader', () => ({ AppHeader: () => null }));
vi.mock('./TopBar', () => ({ TopBar: () => null }));
vi.mock('./StatusBar', () => ({ StatusBar: () => null }));
vi.mock('./ControllerHud', () => ({ ControllerHud: () => null }));
vi.mock('./GlobalMusicPlayer', () => ({ GlobalMusicPlayer: () => null }));
vi.mock('./GalleryFab', () => ({ GalleryFab: () => null }));

beforeEach(() => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
  scan.status = 'not_asked'; scan.skip.mockReset();
  useUiStore.setState({ entryState: 'app' });
});
afterEach(() => { cleanup(); Reflect.deleteProperty(window, '__TAURI_INTERNALS__'); });

describe('first-use game discovery in the actual app shell', () => {
  it('opens its real modal inside the overlay provider and allows skipping', () => {
    const view = render(<MemoryRouter><PersistentAppShell><main>Biblioteca local</main></PersistentAppShell></MemoryRouter>);
    expect(view.getByRole('dialog').textContent).toContain('¿Buscamos tus juegos instalados?');
    expect(document.querySelector('[data-overlay-host] [role="dialog"]')).not.toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Omitir' }));
    expect(scan.skip).toHaveBeenCalledOnce();
  });
  it('opens the explicit review route and closes the introduction', () => {
    const view = render(<MemoryRouter><PersistentAppShell><main>Biblioteca local</main></PersistentAppShell></MemoryRouter>);
    fireEvent.click(view.getByRole('button', { name: 'Escanear ahora' }));
    expect(view.queryByRole('dialog')).toBeNull();
  });
  it('does not interrupt an installation where the prompt was skipped', () => {
    scan.status = 'skipped';
    const view = render(<MemoryRouter><PersistentAppShell><main>Biblioteca local</main></PersistentAppShell></MemoryRouter>);
    expect(view.queryByRole('dialog')).toBeNull();
  });
});
