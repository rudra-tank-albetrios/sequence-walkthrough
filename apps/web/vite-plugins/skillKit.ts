/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { KIT_NAME } from '@swv/build-skills/src/config.ts';
import type { Plugin } from 'vite';

/**
 * Serves the kit that tools/build-skills makes next to the page: an emitted asset in the build, a
 * middleware in the dev server. `npm run build` makes the kit first; anywhere else, when the file
 * is missing, it is made on demand. The name stays version 2's, so links to it keep working.
 */
export const SKILL_KIT_FILE = `${KIT_NAME}.zip`;

async function readSkillKit(): Promise<Uint8Array> {
  const { buildSkills, DEFAULT_OUT } = await import('@swv/build-skills/src/build.ts');
  const file = resolve(DEFAULT_OUT, SKILL_KIT_FILE);
  if (!existsSync(file)) await buildSkills(DEFAULT_OUT);
  return new Uint8Array(readFileSync(file));
}

export function skillKit(): Plugin {
  // emitFile exists only in a build; the dev server (and Vitest) serve the zip through the middleware.
  let building = false;
  return {
    name: 'swv:skill-kit',
    configResolved(config) {
      building = config.command === 'build';
    },
    async buildStart() {
      if (building)
        this.emitFile({ type: 'asset', fileName: SKILL_KIT_FILE, source: await readSkillKit() });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `/${SKILL_KIT_FILE}`) {
          next();
          return;
        }
        readSkillKit().then((zip) => {
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Length', String(zip.byteLength));
          res.end(Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength));
        }, next);
      });
    },
  };
}
