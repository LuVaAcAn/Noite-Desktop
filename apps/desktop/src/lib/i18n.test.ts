import { describe, expect, it } from 'vitest';
import { en, es } from './i18n';

describe('translation catalogs', () => {
  it('have identical keys and non-empty messages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    expect(Object.values(en).every(Boolean)).toBe(true);
    expect(Object.values(es).every(Boolean)).toBe(true);
  });
});
