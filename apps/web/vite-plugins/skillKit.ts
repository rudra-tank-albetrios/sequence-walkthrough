/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { zipSync, type Zippable } from 'fflate';
import type { Plugin } from 'vite';

/**
 * Builds `sequence-walkthrough-skill-kit.zip` from the repository's skill folder and skill-kit files
 * and serves it next to the page (an emitted asset in the build, a middleware in the dev server).
 * Same layout as version 2's kit: the skill-kit files at the root, the skill folder as
 * `sequence-walkthrough/` (what the install scripts expect) and `sequence-walkthrough.zip` for the
 * Claude app. Entries are sorted with a fixed timestamp, so the same sources give the same bytes.
 * The website also publishes `sequence-walkthrough.zip` on its own, as version 2's did.
 */
export const SKILL_KIT_FILE = 'sequence-walkthrough-skill-kit.zip';
const SKILL_ZIP_FILE = 'sequence-walkthrough.zip';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SKILL_DIR = resolve(ROOT, 'skill/sequence-walkthrough');
const KIT_DIR = resolve(ROOT, 'skill-kit');
const STAMP = new Date(2026, 9, 29);

const excluded = (rel: string): boolean =>
  /(^|\/)(__pycache__|evals)(\/|$)/.test(rel) || rel.endsWith('.pyc');

/** Files under `dir`, as sorted posix paths relative to it. */
function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    const rel = relative(base, full).replaceAll('\\', '/');
    if (excluded(rel)) continue;
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

export function zipEntries(files: [name: string, data: Uint8Array][]): Uint8Array {
  const entries: Zippable = {};
  for (const [name, data] of [...files].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const mode = /\.(sh|py)$/.test(name) ? 0o100755 : 0o100644;
    entries[name] = [data, { level: 9, mtime: STAMP, os: 3, attrs: (mode << 16) >>> 0 }];
  }
  return zipSync(entries, { level: 9 });
}

const skillFiles = (): [string, Uint8Array][] =>
  walk(SKILL_DIR).map((rel) => [
    `sequence-walkthrough/${rel}`,
    new Uint8Array(readFileSync(resolve(SKILL_DIR, rel))),
  ]);

function buildSkillKit(): Uint8Array {
  const skill = skillFiles();
  const kit: [string, Uint8Array][] = walk(KIT_DIR).map((rel) => [
    rel,
    new Uint8Array(readFileSync(resolve(KIT_DIR, rel))),
  ]);
  return zipEntries([...kit, ...skill, [SKILL_ZIP_FILE, zipEntries(skill)]]);
}

/** The kit as text, for the one-file build to carry inside the page. */
export const skillKitBase64url = (): string => Buffer.from(buildSkillKit()).toString('base64url');

export function skillKit(): Plugin {
  // emitFile exists only in a build; the dev server (and Vitest) serve the zip through the middleware.
  let building = false;
  return {
    name: 'swv:skill-kit',
    configResolved(config) {
      building = config.command === 'build';
    },
    buildStart() {
      if (!building) return;
      this.emitFile({ type: 'asset', fileName: SKILL_KIT_FILE, source: buildSkillKit() });
      this.emitFile({ type: 'asset', fileName: SKILL_ZIP_FILE, source: zipEntries(skillFiles()) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `/${SKILL_KIT_FILE}`) {
          next();
          return;
        }
        const zip = buildSkillKit();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Length', String(zip.byteLength));
        res.end(Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength));
      });
    },
  };
}
