import { useFlowStore } from '../../shared/state/flowStore.ts';
import { saveSettings } from '../../shared/storage/settings.ts';

/** The card height a drag may set: 90 px up to three quarters of the window. */
export const MIN_CARD_H = 90;
export const maxCardH = (): number => Math.round(window.innerHeight * 0.75);

/** Forgets the dragged height: the key leaves the saved settings, as version 2 did. */
export function resetCardHeight(): void {
  useFlowStore.setState((s) => {
    const { cardH: _dropped, ...settings } = s.settings;
    saveSettings(settings);
    return { settings };
  });
}
