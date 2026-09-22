// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadSpotifyIframeApi,
  resetSpotifyIframeApiForTests,
  SPOTIFY_API_TIMEOUT_MS,
  SPOTIFY_IFRAME_ALLOW,
  type SpotifyIframeApi,
} from './spotify-iframe-api';

const api: SpotifyIframeApi = { createController() {} };

afterEach(() => {
  resetSpotifyIframeApiForTests();
  vi.useRealTimers();
});

describe('Spotify iframe API loader', () => {
  it('is idempotent in StrictMode and resolves with an existing script', async () => {
    const script = document.createElement('script');
    script.dataset.noiteSpotifyApi = 'true';
    document.head.appendChild(script);
    const first = loadSpotifyIframeApi();
    const second = loadSpotifyIframeApi();
    expect(second).toBe(first);
    (window as Window & { onSpotifyIframeApiReady?: (value: SpotifyIframeApi) => void }).onSpotifyIframeApiReady?.(api);
    await expect(first).resolves.toBe(api);
    expect(document.querySelectorAll('script[data-noite-spotify-api]')).toHaveLength(1);
  });

  it('times out, removes the stale script and permits a retry', async () => {
    vi.useFakeTimers();
    const first = loadSpotifyIframeApi();
    const rejected = expect(first).rejects.toThrow('spotify_api_unavailable');
    await vi.advanceTimersByTimeAsync(SPOTIFY_API_TIMEOUT_MS);
    await rejected;
    expect(document.querySelector('script[data-noite-spotify-api]')).toBeNull();

    const retry = loadSpotifyIframeApi();
    expect(retry).not.toBe(first);
    (window as Window & { onSpotifyIframeApiReady?: (value: SpotifyIframeApi) => void }).onSpotifyIframeApiReady?.(api);
    await expect(retry).resolves.toBe(api);
  });

  it('keeps all capabilities required by Spotify on the direct iframe fallback', () => {
    expect(SPOTIFY_IFRAME_ALLOW.split('; ')).toEqual(['autoplay', 'clipboard-write', 'encrypted-media', 'fullscreen', 'picture-in-picture']);
  });
});
