/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ASE_API_BASE?: string;
  readonly VITE_ASE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
