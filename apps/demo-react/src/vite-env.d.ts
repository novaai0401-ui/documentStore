/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override of the GA4 Measurement ID (a production default is baked
   *  into the build). Set it as a Render environment variable only to target a
   *  different GA4 property. */
  readonly VITE_GA_ID?: string;
}
