import {
  forgetUsage,
  loadModelState,
  loadUsage,
  onAiChange,
  saveModelState,
  type ModelEntry,
  type ModelState,
  type UsageRecord,
} from '@swv/ai';
import { create } from 'zustand';

interface AiState {
  /** The saved model list. `@swv/ai` owns it; this keeps the screens in step with it. */
  state: ModelState;
  usage: Readonly<Partial<Record<string, UsageRecord>>>;
  /** When these were read, so a bar never judges a new reading by an older clock. */
  readAt: number;
}

const read = (): AiState => ({ state: loadModelState(), usage: loadUsage(), readAt: Date.now() });

export const useAiStore = create<AiState>(read);

/** Reads storage again, for a change made outside `@swv/ai`'s own save functions. */
export const refreshAiStore = (): void => {
  useAiStore.setState(read());
};

onAiChange(refreshAiStore);

const change = (edit: (state: ModelState) => ModelState): void => {
  saveModelState(edit(loadModelState()));
};

/** Adds a new entry at the end, or replaces the entry with the same id. The first becomes active. */
export function saveModel(entry: ModelEntry): void {
  change((state) => {
    const known = state.models.some((m) => m.id === entry.id);
    const models = known ? state.models.map((m) => (m.id === entry.id ? entry : m)) : [...state.models, entry];
    return { ...state, models, activeId: state.activeId || entry.id };
  });
}

/** Removes an entry with its key and usage. The next one takes over when it was active. */
export function deleteModel(id: string): void {
  change((state) => {
    const models = state.models.filter((m) => m.id !== id);
    return { ...state, models, activeId: state.activeId === id ? (models[0]?.id ?? '') : state.activeId };
  });
  forgetUsage(id);
}

/** Moves an entry up (-1) or down (1) the list, which sets the order fallbacks are tried in. */
export function moveModel(id: string, by: -1 | 1): void {
  change((state) => {
    const models = [...state.models];
    const from = models.findIndex((m) => m.id === id);
    const moved = models[from];
    if (!moved || from + by < 0 || from + by >= models.length) return state;
    models.splice(from, 1);
    models.splice(from + by, 0, moved);
    return { ...state, models };
  });
}

export function setActiveModel(id: string): void {
  change((state) => ({ ...state, activeId: id }));
}

export function setFallback(id: string, fallback: boolean): void {
  change((state) => ({ ...state, models: state.models.map((m) => (m.id === id ? { ...m, fallback } : m)) }));
}

export function setSwitchAt(switchAt: number): void {
  change((state) => ({ ...state, switchAt }));
}

export function setForgetKeys(forgetKeys: boolean): void {
  change((state) => ({ ...state, forgetKeys }));
}
