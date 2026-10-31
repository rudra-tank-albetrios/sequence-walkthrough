import { useSyncExternalStore } from 'react';

import { installedVoices, onVoicesChanged } from '../lib/speech.ts';

/** The installed voices, kept current. Empty where speech is unsupported or no voice is installed. */
export function useVoices(): SpeechSynthesisVoice[] {
  const count = useSyncExternalStore(onVoicesChanged, () => installedVoices().length);
  return count ? installedVoices() : [];
}
