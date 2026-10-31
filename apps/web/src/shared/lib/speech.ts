/**
 * Reading a step aloud with the browser's own voices. Nothing is fetched by this page; the text
 * goes only to the voice the device provides.
 */

/** The voice speeds offered, as a multiple of normal speech. */
export const VOICE_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const speechApi = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
    ? window.speechSynthesis
    : null;

/** The voices this device has installed. Empty where speech is unsupported. */
export const installedVoices = (): SpeechSynthesisVoice[] => speechApi()?.getVoices() ?? [];

/** Calls `listener` when the installed voices change, which is how most browsers first report them. */
export function onVoicesChanged(listener: () => void): () => void {
  const api = speechApi();
  api?.addEventListener('voiceschanged', listener);
  return () => {
    api?.removeEventListener('voiceschanged', listener);
  };
}

const CLEAR_NAME = /natural|neural|premium|enhanced|siri|online/i;
const FAIR_NAME = /google|microsoft/i;

function voiceScore(voice: SpeechSynthesisVoice, language: string): number {
  const lang = voice.lang.toLowerCase();
  const wanted = language.toLowerCase();
  let score = 0;
  if (lang === wanted) score += 8;
  else if (lang.split(/[-_]/)[0] === wanted.split('-')[0]) score += 6;
  if (CLEAR_NAME.test(voice.name)) score += 3;
  else if (FAIR_NAME.test(voice.name)) score += 1;
  return score;
}

/** The saved voice when it is still installed, else the clearest one for this language. */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  savedUri: string,
  language: string,
): SpeechSynthesisVoice | null {
  const saved = voices.find((voice) => voice.voiceURI === savedUri);
  if (saved) return saved;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = voiceScore(voice, language);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

const splitWords = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

const FILE_KIND: Record<string, string> = { ts: 'file', tsx: 'file', js: 'file', jsx: 'file', py: 'file', json: 'file' };

/** `src/orders/orderService.ts` and `/api/orders/:id` as a listener would want to hear them. */
function speakPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const dot = /^(.+)\.(\w+)$/.exec(last);
  if (dot?.[1] && dot[2] && FILE_KIND[dot[2].toLowerCase()]) return `the ${splitWords(dot[1])} file`;
  return parts.map((part) => splitWords(part.replace(/^[:{]|\}$/g, ''))).join(' ');
}

/** A step's plain explanation as speech: no markup, and paths and code become simple words. */
export function speakableText(explain: string): string {
  return explain
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/([^/\s]+)\S*/g, '$1')
    .replace(/(^|[\s(`])((?:\.{0,2}\/)?[\w.:{}-]+(?:\/[\w.:{}-]+)+\/?|\/[\w.:{}-]+\/?)/g, (_, lead: string, path: string) => {
      return `${lead}${speakPath(path)}`;
    })
    .replace(/\b([A-Za-z_][\w.]*)\(\)/g, (_, name: string) => splitWords(name.replace(/\./g, ' ')))
    .replace(/`([^`]*)`/g, (_, code: string) => splitWords(code.replace(/[.()[\]{}<>=;:]+/g, ' ')))
    .replace(/\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b/g, splitWords)
    .replace(/->|→|=>/g, ' to ')
    .replace(/[*_#>|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_PIECE = 200;

/** Some browsers cut a long utterance off without a word, so the text goes out in short pieces. */
export function speechPieces(text: string): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const sentence of text.match(/[^.!?]+[.!?]*\s*/g) ?? []) {
    if (piece && piece.length + sentence.length > MAX_PIECE) {
      pieces.push(piece.trim());
      piece = '';
    }
    piece += sentence;
    while (piece.length > MAX_PIECE) {
      const cut = piece.lastIndexOf(' ', MAX_PIECE);
      const end = cut > 0 ? cut : MAX_PIECE;
      pieces.push(piece.slice(0, end).trim());
      piece = piece.slice(end);
    }
  }
  if (piece.trim()) pieces.push(piece.trim());
  return pieces;
}

/** Longer than any real voice takes, so a voice that never reports back cannot stop the walkthrough. */
const pieceLimitMs = (piece: string, rate: number): number => (piece.length / (6 * rate)) * 1000 + 4000;

export interface Speech {
  pause(): void;
  /** Carries on, and calls `onDone` once the text has been read, at once if it already has. */
  resume(onDone: () => void): void;
  cancel(): void;
}

/** Starts reading `text`. Only one reading runs at a time: this ends any earlier one. */
export function speak(
  text: string,
  options: { rate: number; voice: SpeechSynthesisVoice | null },
  onDone: () => void,
): Speech {
  const api = speechApi();
  const pieces = speechPieces(text);
  let index = 0;
  let done = !api || pieces.length === 0;
  let ended = false;
  let paused = false;
  let notify = onDone;
  let limit: ReturnType<typeof setTimeout> | undefined;

  const stopLimit = () => {
    clearTimeout(limit);
  };
  const startLimit = () => {
    stopLimit();
    limit = setTimeout(nextPiece, pieceLimitMs(pieces[index] ?? '', options.rate));
  };
  const finish = () => {
    done = true;
    stopLimit();
    if (!paused) notify();
  };
  function nextPiece() {
    if (ended || done) return;
    index += 1;
    if (index >= pieces.length) finish();
    else say();
  }
  function say() {
    const utterance = new SpeechSynthesisUtterance(pieces[index]);
    utterance.rate = options.rate;
    if (options.voice) {
      utterance.voice = options.voice;
      utterance.lang = options.voice.lang;
    }
    const piece = index;
    const settled = () => {
      if (piece === index) nextPiece();
    };
    utterance.onend = settled;
    // The voice failed, or the page may not speak yet. The walkthrough carries on without it.
    utterance.onerror = settled;
    api?.speak(utterance);
    if (!paused) startLimit();
  }

  api?.cancel();
  api?.resume();
  if (done) queueMicrotask(notify);
  else say();

  return {
    pause() {
      if (done || ended || paused) return;
      paused = true;
      stopLimit();
      api?.pause();
    },
    resume(next) {
      notify = next;
      if (done) {
        next();
        return;
      }
      if (!paused) return;
      paused = false;
      api?.resume();
      startLimit();
    },
    cancel() {
      if (ended) return;
      ended = true;
      stopLimit();
      api?.cancel();
      api?.resume();
    },
  };
}
