import { hostAnswers, readKeyInfo, sendChat } from './client.ts';
import { modelHost } from './consent.ts';
import { endpointUrl, modelProblem, type ModelEntry } from './models.ts';
import { presetFor } from './presets.ts';
import { recordUsage } from './usage.ts';

/** The Test button's request: fixed text, so it sends nothing from any flow and needs no notice. */
const TEST_SYSTEM = 'Reply with the single word OK.';
const TEST_PROMPT = 'Question: Reply with the single word OK.';
const TEST_MAX_TOKENS = 8;
const TEST_TIMEOUT_MS = 20_000;

export interface ModelCheck {
  ok: boolean;
  /** A plain sentence for the settings row. */
  message: string;
}

const isLocal = (url: string): boolean => /^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url);

/** Why a call failed with no reply: the browser refused it, or nothing is there. */
async function explainNoReply(entry: ModelEntry): Promise<string> {
  const url = endpointUrl(entry);
  const host = modelHost(entry);
  if (!navigator.onLine) return 'This browser is offline.';
  if (!(await hostAnswers(url))) {
    return isLocal(url)
      ? `Nothing answered at ${host}. Is it running on this computer?`
      : `Nothing answered at ${host}. Check the address and your connection.`;
  }
  if (entry.preset === 'ollama') {
    return `Ollama is running but refuses this page. Start it with OLLAMA_ORIGINS=${location.origin === 'null' ? '*' : location.origin} and pull the model first.`;
  }
  const hiddenKey = presetFor(entry.preset).hidesBadKey
    ? `${entry.name} hides a wrong key from browsers, so check the key first. If the key is right, `
    : 'This usually means ';
  return `Your browser blocked the reply from ${host}. ${hiddenKey}this provider does not allow calls from web pages, or the link redirects. Use another model, or a proxy you trust as your own model link.`;
}

/**
 * `testModel(entry: ModelEntry): Promise<ModelCheck>`
 *
 * The Test button: sends one tiny fixed question straight to this model, with no switching and no
 * cache, and says in a sentence what happened. A failure is explained, a blocked browser call most
 * of all. Never throws.
 */
export async function testModel(entry: ModelEntry): Promise<ModelCheck> {
  const problem = modelProblem(entry);
  if (problem) return { ok: false, message: problem };
  const reply = await sendChat(entry, {
    system: TEST_SYSTEM,
    prompt: TEST_PROMPT,
    maxTokens: TEST_MAX_TOKENS,
    timeoutMs: TEST_TIMEOUT_MS,
  });
  const now = Date.now();
  if (!reply.ok) {
    if (reply.failure.kind === 'network') return { ok: false, message: await explainNoReply(entry) };
    recordUsage(entry.id, reply.windows.length ? { windows: reply.windows } : {}, now);
    return { ok: false, message: reply.failure.message };
  }
  const info = await readKeyInfo(entry, now);
  const windows = info.length ? info : reply.windows;
  recordUsage(entry.id, { tokens: reply.tokens ?? TEST_MAX_TOKENS, windows }, now);
  const usage = windows.length
    ? 'Usage is exact, read from the provider.'
    : 'This provider does not show its limits to browsers, so usage is counted in this browser.';
  return { ok: true, message: `Works. ${entry.name} said: ${reply.text.trim().slice(0, 60)}. ${usage}` };
}
