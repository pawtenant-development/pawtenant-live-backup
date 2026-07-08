/// <reference types="vite/client" />

declare const __BASE_PATH__: string;
declare const __IS_PREVIEW__: boolean;
declare const __READDY_PROJECT_ID__: string;
declare const __READDY_VERSION_ID__: string;
declare const __READDY_AI_DOMAIN__: string;

// ── Microsoft Advertising UET (Bing/Yahoo/AOL search ads) ──────────────
// VITE_MICROSOFT_UET_ID:      tag id (default "97255523" = current account
//                             HyperSpace/G12027LJ; old tag 187256974 abandoned).
// VITE_MICROSOFT_UET_ENABLED: "true" loads bat.js (set on LIVE/Production).
// VITE_MICROSOFT_UET_DEBUG:   "true" (or URL ?uetdebug=1) enables debug
//                             logging and lets the conversion fire on a
//                             non-prod host for verification.
interface ImportMetaEnv {
  readonly VITE_MICROSOFT_UET_ID?: string;
  readonly VITE_MICROSOFT_UET_ENABLED?: string;
  readonly VITE_MICROSOFT_UET_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}