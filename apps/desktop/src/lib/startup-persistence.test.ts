import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStartupState, withStartupTimeout } from './startup-persistence';

afterEach(() => vi.useRealTimers());
describe('local startup persistence', () => {
  it('opens existing SQLite data even when legacy IndexedDB would never respond', async () => {
    const legacy = vi.fn(() => new Promise<Record<string, unknown>>(() => {}));
    await expect(readStartupState(async () => ({ libraryItems: [{ id: 'kept' }] }), legacy)).resolves.toEqual({ nativeState: { libraryItems: [{ id: 'kept' }] }, legacyState: {} });
    expect(legacy).not.toHaveBeenCalled();
  });
  it('retains the legacy migration on an empty native database', async () => {
    await expect(readStartupState(async () => ({}), async () => ({ settings: { userName: 'Ana' } }))).resolves.toMatchObject({ legacyState: { settings: { userName: 'Ana' } } });
  });
  it('never substitutes an empty library when native persistence fails', async () => {
    const legacy = vi.fn();
    await expect(readStartupState(async () => { throw new Error('disk failure'); }, legacy)).rejects.toThrow('disk failure');
    expect(legacy).not.toHaveBeenCalled();
  });
  it('leaves stalled reads with a recoverable error', async () => {
    vi.useFakeTimers();
    const result = withStartupTimeout(new Promise(() => {}), 100);
    const assertion = expect(result).rejects.toThrow('tardó demasiado');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
