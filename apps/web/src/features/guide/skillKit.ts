import { downloadBlob } from '../../shared/lib/util.ts';

/** The skill, its setup guide and the install scripts, built into the site next to the page. */
export const SKILL_KIT_NAME = 'sequence-walkthrough-skill-kit.zip';

/** Fetches the kit and saves it. Throws when the server answers with something that is not a zip. */
export async function downloadSkillKit(): Promise<void> {
  const res = await fetch(`./${SKILL_KIT_NAME}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  // A zip starts with "PK"; a dev server without the file answers with the page instead.
  if (head[0] !== 0x50 || head[1] !== 0x4b) throw new Error('the skill kit is not part of this build');
  downloadBlob(new Blob([blob], { type: 'application/zip' }), SKILL_KIT_NAME);
}
