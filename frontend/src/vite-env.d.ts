/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base pública de la API. No es un secreto: se incrusta en el bundle. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
