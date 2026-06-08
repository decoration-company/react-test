/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_COMMERCE_API_BASE_URL: string
  readonly VITE_TIGERS_ALLOWED_ORIGINS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

