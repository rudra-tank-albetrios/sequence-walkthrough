import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig, type Plugin } from 'vitest/config';

import { oneFilePage } from './vite-plugins/oneFilePage.ts';
import { skillKit, skillKitBase64url } from './vite-plugins/skillKit.ts';

// Plan section 4: no external scripts, everything bundled. GitHub Pages cannot send headers, so the
// policy is a <meta> tag. It is added to production builds only: the dev server and React refresh
// need an inline script, which the policy forbids. The one-file build has its own policy, in
// vite-plugins/oneFilePage.ts, because this one would block its inlined script.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Ask AI calls the model URL the user chose; Ollama runs on localhost over http
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'swv:content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  // `vite build --mode single` is the one-file build, in its own output folder.
  const oneFile = mode === 'single';
  return {
    base: './',
    plugins: [
      react(),
      ...(oneFile ? [viteSingleFile(), oneFilePage()] : [contentSecurityPolicy(), skillKit()]),
    ],
    define: {
      // A file next to the page on the website; inside the page in the one-file build.
      __SKILL_KIT__: JSON.stringify(oneFile ? skillKitBase64url() : ''),
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      outDir: oneFile ? 'dist-single' : 'dist',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: { modules: { classNameStrategy: 'non-scoped' } },
    },
  };
});
