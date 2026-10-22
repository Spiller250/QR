/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** App key for the built-in web scanner (must match a `web-scanner:<key>` entry in APP_KEYS). */
  readonly VITE_APP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
