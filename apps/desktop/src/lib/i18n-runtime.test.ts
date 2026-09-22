// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { getRuntimeLocale, localizeNativeError, setRuntimeLocale, translateLiteral } from './i18n-runtime';

afterEach(() => setRuntimeLocale('es'));

describe('runtime localization', () => {
  it('translates catalog literals and dynamic phrases for English profiles', () => {
    setRuntimeLocale('en');

    expect(translateLiteral('Pel\u00edculas')).toBe('Movies');
    expect(translateLiteral('7 actividades recientes')).toBe('7 recent activities');
    expect(translateLiteral('Recetas recientes')).toBe('Recent Recetas');
    expect(translateLiteral(' Pel\u00edculas recientes ')).toBe(' Recent Movies ');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('noite-locale')).toBe('en');
  });

  it('keeps Spanish literals unchanged for Spanish profiles', () => {
    setRuntimeLocale('es');
    expect(getRuntimeLocale()).toBe('es');
    expect(translateLiteral('Guardar cambios')).toBe('Guardar cambios');
  });

  it('maps stable native error codes without exposing Rust messages', () => {
    setRuntimeLocale('en');
    const error = localizeNativeError({
      code: 'peer_unavailable',
      message: 'El otro equipo no respondi\u00f3.',
      details: { retryable: true },
    }) as Error & { code?: string; details?: unknown };

    expect(error.message).toContain('other computer');
    expect(error.code).toBe('peer_unavailable');
    expect(error.details).toEqual({ retryable: true });
  });
});
