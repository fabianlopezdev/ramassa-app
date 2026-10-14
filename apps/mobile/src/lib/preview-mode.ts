/**
 * Whether the app is showing the player preview (RAPP-371, ADR-027), the player
 * screen it should open first, and her own language to return to. Kept on the
 * device, because choosing a right-to-left preview language restarts the app,
 * and the preview must come back after the restart. Leaving the preview
 * removes it.
 *
 * No Supabase import here: `supabase.ts` reads this store to pick the client,
 * and `player-preview.ts` starts and ends the session.
 */
import { useSyncExternalStore } from 'react';

const PREVIEW_STATE_KEY = 'ramassa.player-preview.v1';

export interface PreviewModeStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

export interface PreviewModeStore {
  /** True while the app shows the player preview. */
  isActive(): boolean;
  start(target: string | null, returnLanguage: string): void;
  /** The player screen to open first, given once. */
  takeTarget(): string | null;
  /** Her own language, to return to when the preview ends. */
  returnLanguage(): string | null;
  end(): void;
  subscribe(listener: () => void): () => void;
}

interface PreviewState {
  readonly target: string | null;
  readonly returnLanguage: string | null;
}

function readState(storage: PreviewModeStorage): PreviewState | null {
  const raw = storage.getString(PREVIEW_STATE_KEY);
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { target, returnLanguage } = parsed as { target?: unknown; returnLanguage?: unknown };
    return {
      target: typeof target === 'string' && target.startsWith('/') ? target : null,
      returnLanguage: typeof returnLanguage === 'string' ? returnLanguage : null,
    };
  } catch {
    return null;
  }
}

export function createPreviewModeStore(storage: PreviewModeStorage): PreviewModeStore {
  let active = readState(storage) !== null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    isActive: () => active,
    start(target, returnLanguage) {
      storage.set(PREVIEW_STATE_KEY, JSON.stringify({ target, returnLanguage }));
      active = true;
      notify();
    },
    takeTarget() {
      const state = readState(storage);
      if (state === null || state.target === null) return null;
      storage.set(PREVIEW_STATE_KEY, JSON.stringify({ ...state, target: null }));
      return state.target;
    },
    returnLanguage: () => readState(storage)?.returnLanguage ?? null,
    end() {
      storage.remove(PREVIEW_STATE_KEY);
      active = false;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function usePreviewModeActive(store: PreviewModeStore): boolean {
  return useSyncExternalStore(store.subscribe, store.isActive, store.isActive);
}
