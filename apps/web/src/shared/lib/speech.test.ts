import { afterEach, describe, expect, it, vi } from 'vitest';

import { pickVoice, speak, speakableText, speechPieces } from './speech.ts';

const voice = (name: string, lang: string, voiceURI = name) =>
  ({ name, lang, voiceURI, default: false, localService: true }) as SpeechSynthesisVoice;

describe('speakableText', () => {
  it('turns paths into simple words', () => {
    expect(speakableText('It calls /api/orders/:id here.')).toBe('It calls api orders id here.');
    expect(speakableText('See src/orders/orderService.ts for more.')).toBe('See the order Service file for more.');
  });

  it('turns code into simple words', () => {
    expect(speakableText('Then `orderService.create()` runs.')).toBe('Then order Service create runs.');
    expect(speakableText('The getUser() call reads user_id.')).toBe('The get User call reads user id.');
  });

  it('drops markup, blocks and links, and keeps the words', () => {
    expect(speakableText('**Saves** the [order](https://x.example/a).\n```\ncode\n```\nDone.')).toBe(
      'Saves the order. Done.',
    );
    expect(speakableText('Sends it to https://pay.example/v1/charge now.')).toBe('Sends it to pay.example now.');
  });

  it('keeps plain sentences as they are', () => {
    const plain = 'The server checks the token and answers 401 when it has expired.';
    expect(speakableText(plain)).toBe(plain);
  });
});

describe('pickVoice', () => {
  const voices = [voice('Basic', 'en-US'), voice('Google US English', 'en-US'), voice('Natural Aria', 'en-US'), voice('Natural Hans', 'de-DE')];

  it('picks the clearest voice in the language', () => {
    expect(pickVoice(voices, '', 'en-US')?.name).toBe('Natural Aria');
    expect(pickVoice(voices, '', 'de-AT')?.name).toBe('Natural Hans');
  });

  it('keeps a saved voice, and falls back when it is gone', () => {
    expect(pickVoice(voices, 'Basic', 'en-US')?.name).toBe('Basic');
    expect(pickVoice(voices, 'Removed', 'en-US')?.name).toBe('Natural Aria');
  });

  it('finds nothing when no voice is installed', () => {
    expect(pickVoice([], '', 'en-US')).toBeNull();
  });
});

describe('speechPieces', () => {
  it('keeps every word, in short pieces', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} of this text.`).join(' ');
    const pieces = speechPieces(text);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((piece) => piece.length <= 200)).toBe(true);
    expect(pieces.join(' ')).toBe(text);
  });

  it('cuts one very long sentence at a space', () => {
    const pieces = speechPieces('word '.repeat(100).trim());
    expect(pieces.every((piece) => piece.length <= 200)).toBe(true);
    expect(pieces.join(' ').split(' ')).toHaveLength(100);
  });

  it('has nothing to read in empty text', () => {
    expect(speechPieces('')).toEqual([]);
  });
});

describe('speak', () => {
  class FakeUtterance {
    rate = 1;
    voice: unknown = null;
    lang = '';
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    text: string;
    constructor(text: string) {
      this.text = text;
    }
  }

  const install = () => {
    const spoken: FakeUtterance[] = [];
    const api = {
      speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [],
    };
    vi.stubGlobal('speechSynthesis', api);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    return { spoken, api };
  };

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const OPTIONS = { rate: 1.5, voice: null };

  it('reads at the chosen speed and reports the end', () => {
    const { spoken } = install();
    const onDone = vi.fn();
    speak('Hello there.', OPTIONS, onDone);
    expect(spoken[0]?.text).toBe('Hello there.');
    expect(spoken[0]?.rate).toBe(1.5);
    expect(onDone).not.toHaveBeenCalled();
    spoken[0]?.onend?.();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('carries on when the voice fails', () => {
    const { spoken } = install();
    const onDone = vi.fn();
    speak('Hello there.', OPTIONS, onDone);
    spoken[0]?.onerror?.();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('does not wait forever for a voice that never reports back', () => {
    vi.useFakeTimers();
    install();
    const onDone = vi.fn();
    speak('Hello there.', OPTIONS, onDone);
    vi.advanceTimersByTime(60_000);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('stands still while paused and goes on after', () => {
    vi.useFakeTimers();
    const { spoken, api } = install();
    const first = vi.fn();
    const second = vi.fn();
    const speech = speak('Hello there.', OPTIONS, first);
    speech.pause();
    expect(api.pause).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60_000);
    expect(first).not.toHaveBeenCalled();
    speech.resume(second);
    expect(api.resume).toHaveBeenCalled();
    spoken[0]?.onend?.();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('reports nothing after being cancelled', () => {
    const { spoken, api } = install();
    const onDone = vi.fn();
    const speech = speak('Hello there.', OPTIONS, onDone);
    speech.cancel();
    expect(api.cancel).toHaveBeenCalledTimes(2);
    spoken[0]?.onerror?.();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('finishes at once when speech is unsupported', async () => {
    const onDone = vi.fn();
    speak('Hello there.', OPTIONS, onDone);
    await Promise.resolve();
    expect(onDone).toHaveBeenCalledOnce();
  });
});
