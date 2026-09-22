/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COVER_SERVICE_URL?: string;
  readonly VITE_COVER_SERVICE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
