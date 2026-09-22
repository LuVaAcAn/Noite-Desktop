// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCAL_SETTINGS } from '@proyecto-noche/domain';
import { AppEntryExperience } from './AppEntryExperience';
import { useUiStore } from '../../stores/ui-store';

vi.mock('../../hooks/use-settings', () => ({
  useSettings: () => ({ data: DEFAULT_LOCAL_SETTINGS, isLoading: false, isError: false }),
  useUpdateSettings: () => ({ mutate: vi.fn() }),
  useSwitchActor: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children }: { children: ReactNode }) => <div>{children}</div>, section: ({ children }: { children: ReactNode }) => <section>{children}</section>, h1: ({ children }: { children: ReactNode }) => <h1>{children}</h1> },
}));
vi.mock('./StatusBar', () => ({ StatusBar: () => null }));
vi.mock('./ControllerHud', () => ({ ControllerHud: () => null }));
vi.mock('./ArcadeLottie', () => ({ ArcadeLottie: () => null }));
vi.mock('./AnimatedIsotipo', () => ({ AnimatedIsotipo: () => null }));

beforeEach(() => { vi.useFakeTimers(); useUiStore.setState({ entryState: 'boot', autoResumeEnabled: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('startup timer regression', () => {
  it('survives StrictMode effect cleanup and settings rerenders instead of staying in boot', async () => {
    const tree = <StrictMode><MemoryRouter><AppEntryExperience><p>Aplicación</p></AppEntryExperience></MemoryRouter></StrictMode>;
    const view = render(tree);
    await act(() => vi.advanceTimersByTimeAsync(100));
    view.rerender(<StrictMode><MemoryRouter><AppEntryExperience><p>Aplicación actualizada</p></AppEntryExperience></MemoryRouter></StrictMode>);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(useUiStore.getState().entryState).toBe('title');
    expect(view.getByRole('button', { name: 'Continuar' })).toBeTruthy();
  });
});
