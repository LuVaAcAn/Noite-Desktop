export interface SpotifyEmbedController {
  togglePlay(): void;
  play(): void;
  destroy(): void;
  addListener(event: string, listener: (event: { data?: { isPaused?: boolean } }) => void): void;
}

export interface SpotifyIframeApi {
  createController(element: HTMLElement, options: { uri: string; width: string; height: number }, callback: (controller: SpotifyEmbedController) => void): void;
}

let spotifyApiPromise: Promise<SpotifyIframeApi> | null = null;
let resolvedSpotifyApi: SpotifyIframeApi | null = null;
export const SPOTIFY_IFRAME_ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
export const SPOTIFY_API_TIMEOUT_MS = 8_000;

export function loadSpotifyIframeApi() {
  if (resolvedSpotifyApi) return Promise.resolve(resolvedSpotifyApi);
  if (spotifyApiPromise) return spotifyApiPromise;
  spotifyApiPromise = new Promise((resolve, reject) => {
    const spotifyWindow = window as Window & { onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void };
    let settled = false;
    const finish = (api: SpotifyIframeApi) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolvedSpotifyApi = api;
      resolve(api);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      spotifyApiPromise = null;
      document.querySelector('script[data-noite-spotify-api]')?.remove();
      reject(new Error('spotify_api_unavailable'));
    };
    spotifyWindow.onSpotifyIframeApiReady = finish;
    const timeout = window.setTimeout(fail, SPOTIFY_API_TIMEOUT_MS);
    let script = document.querySelector<HTMLScriptElement>('script[data-noite-spotify-api]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      script.dataset.noiteSpotifyApi = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('error', fail, { once: true });
  });
  return spotifyApiPromise;
}

export function resetSpotifyIframeApiForTests() {
  spotifyApiPromise = null;
  resolvedSpotifyApi = null;
  const spotifyWindow = window as Window & { onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void };
  delete spotifyWindow.onSpotifyIframeApiReady;
  document.querySelectorAll('script[data-noite-spotify-api]').forEach((script) => script.remove());
}
