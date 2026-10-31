import { useFlowStore } from '../state/flowStore.ts';
import { toast } from '../ui/toast.ts';
import { copyText, downloadBlob } from './util.ts';

/** Saving files and copying text, with the Claude artifact host's capabilities when present. */

interface DownloadsCapability {
  save: (options: { filename: string; data: Blob }) => Promise<unknown>;
}

interface ClaudeHost {
  use: (capability: string) => Promise<unknown>;
}

/** The artifact host object, when this page runs inside a Claude artifact. */
export function claudeHost(): ClaudeHost | null {
  const host: unknown = Reflect.get(window, 'claude');
  if (typeof host !== 'object' || host === null) return null;
  return typeof (host as { use?: unknown }).use === 'function' ? (host as ClaudeHost) : null;
}

export const inArtifact = (): boolean => Reflect.has(window, 'claude');

let downloads: Promise<DownloadsCapability | null> | null = null;

function downloadsCapability(): Promise<DownloadsCapability | null> {
  downloads ??= (async () => {
    const host = claudeHost();
    if (!host) return null;
    try {
      const cap: unknown = await host.use('downloads');
      return typeof cap === 'object' && cap !== null && typeof (cap as { save?: unknown }).save === 'function'
        ? (cap as DownloadsCapability)
        : null;
    } catch {
      return null;
    }
  })();
  return downloads;
}

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined;

/** Saves through the artifact host when there is one, else as a browser download. */
export async function saveFile(name: string, data: Blob | string | Uint8Array, type?: string): Promise<void> {
  const blob =
    data instanceof Blob ? data : new Blob([data as BlobPart], { type: type ?? 'application/octet-stream' });
  const cap = await downloadsCapability();
  if (!cap) {
    downloadBlob(blob, name);
    toast(`Downloaded ${name}`);
    return;
  }
  try {
    await cap.save({ filename: name, data: blob });
    toast(`Saved ${name}`);
  } catch (error) {
    const code = errorCode(error);
    if (code === 'declined') return;
    if (code === 'rejected_extension') {
      toast(`.${name.split('.').pop() ?? ''} files can't be saved from this page. The text is the same in a .txt file.`, {
        label: 'Save as .txt',
        onClick: () => {
          void saveFile(`${name}.txt`, blob);
        },
      });
      return;
    }
    toast(`Could not save ${name}: ${error instanceof Error ? error.message : (code ?? 'unavailable')}`);
  }
}

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(area);
  area.select();
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the fallback when the clipboard API is refused
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Copies with the clipboard API, then execCommand, then a dialog that shows the text. */
export async function copyWithFallback(text: string, message: string): Promise<boolean> {
  if ((await copyText(text)) || legacyCopy(text)) {
    toast(message);
    return true;
  }
  useFlowStore.getState().setUi({ copyFallback: text });
  return false;
}

export const SKILL_KIT_FILE = 'sequence-walkthrough-skill-kit.zip';

/** The skill, its setup guide and the install scripts: a zip built into the site next to the page. */
export async function downloadSkillKit(): Promise<void> {
  try {
    const response = await fetch(`./${SKILL_KIT_FILE}`);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // A zip starts with "PK"; a dev server without the file answers with the page instead.
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('the skill kit is not part of this build');
    await saveFile(SKILL_KIT_FILE, bytes, 'application/zip');
  } catch (error) {
    toast(`Download failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
