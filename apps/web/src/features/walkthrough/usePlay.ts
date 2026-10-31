import { useEffect, useRef } from 'react';

import { useVoices } from '../../shared/hooks/useVoices.ts';
import { pickVoice, speak, speakableText, type Speech } from '../../shared/lib/speech.ts';
import { useFlowStore, visibleSteps } from '../../shared/state/flowStore.ts';
import { toast } from '../../shared/ui/toast.ts';

/** One tick of autoplay: the next visible step, or stop at the end or at a locked chapter. */
function tick(): void {
  const s = useFlowStore.getState();
  const n = s.flow?.isSequence ? s.flow.steps.length : 0;
  if (!n || !visibleSteps(s.flow, s.path).some((i) => i > s.cur)) {
    s.setPlaying(false);
    return;
  }
  const message = s.next();
  if (message) {
    toast(message);
    s.setPlaying(false);
  }
}

/**
 * Autoplay: while `playing`, each step stays for `settings.speed` ms and until the voice has read
 * it. Starting at the end goes back to step 1. Pause holds the speech where it is; a skip, a new
 * voice setting or mute drops it. A new speed restarts the timer; the Ask panel pauses it.
 */
export function usePlay(): void {
  const playing = useFlowStore((s) => s.playing);
  const speed = useFlowStore((s) => s.settings.speed);
  const askOpen = useFlowStore((s) => s.ui.askOpen);
  const cur = useFlowStore((s) => s.cur);
  const explain = useFlowStore((s) => s.flow?.steps[s.cur]?.explain ?? '');
  const muted = useFlowStore((s) => s.settings.voiceMuted);
  const rate = useFlowStore((s) => s.settings.voiceRate);
  const savedVoice = useFlowStore((s) => s.settings.voiceURI);
  const voices = useVoices();
  const voiced = voices.length > 0 && !muted;
  const voice = voiced ? pickVoice(voices, savedVoice, navigator.language) : null;
  const started = useRef(false);
  const reading = useRef<{ key: string; speech: Speech } | null>(null);

  useEffect(() => {
    if (!playing) {
      started.current = false;
      return;
    }
    if (askOpen || started.current) return;
    started.current = true;
    const s = useFlowStore.getState();
    const n = s.flow?.isSequence ? s.flow.steps.length : 0;
    if (n && s.cur >= n - 1) s.go(0);
    // With the voice on, a step already on screen is read first, not skipped.
    else if (s.cur < 0 || !voiced) tick();
  }, [playing, askOpen, voiced]);

  const text = voiced && cur >= 0 ? speakableText(explain) : '';
  const key = text ? JSON.stringify([cur, text, rate, voice?.voiceURI]) : '';

  useEffect(() => {
    if (reading.current && reading.current.key !== key) {
      reading.current.speech.cancel();
      reading.current = null;
    }
    if (!playing || askOpen) return;
    let waited = false;
    let read = !key;
    const advance = () => {
      if (waited && read) tick();
    };
    const timer = setTimeout(
      () => {
        waited = true;
        advance();
      },
      Math.max(200, speed),
    );
    const onRead = () => {
      read = true;
      advance();
    };
    if (reading.current) reading.current.speech.resume(onRead);
    else if (key) reading.current = { key, speech: speak(text, { rate, voice }, onRead) };
    return () => {
      clearTimeout(timer);
      reading.current?.speech.pause();
    };
    // `text`, `rate` and `voice` are all part of `key`, and `cur` is what restarts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, askOpen, speed, cur, key]);

  useEffect(() => {
    const stop = () => {
      reading.current?.speech.cancel();
      reading.current = null;
    };
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, []);
}
