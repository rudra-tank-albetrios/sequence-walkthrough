/// <reference types="vite/client" />

/**
 * The skill kit zip in base64url, inside the page in the one-file build. Empty on the website, where
 * the zip is a file next to the page (vite.config.ts).
 */
declare const __SKILL_KIT__: string;
