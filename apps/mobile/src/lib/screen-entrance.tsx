/**
 * When a screen plays its entrance (RAPP-557, app-wide since RAPP-875): the
 * first time she reaches it after opening the app. A screen she has already
 * seen during this use of the app is simply there. Closing the app, or
 * signing in with another account, starts again.
 *
 * Two parts:
 *
 * - The SEEN set lives above the navigators, so pushing, replacing and popping
 *   routes does not forget earlier visits. A wizard step is recorded by its own
 *   stable id, every other screen by its route name.
 * - The ROUTE entrance is what the navigator decided for the screen that is
 *   open. A screen that draws its own entrance block by block (the shared form
 *   layout) reads that decision and takes the entrance over, so the screen and
 *   its blocks never both move. The content column reads it to rise.
 */
import { createContext, use, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type EntranceMode = 'staggered' | 'none';

const SeenScreensContext = createContext<Set<string> | null>(null);

/** Lives with the signed-in navigator, keyed by the account. */
export function ScreenEntranceProvider({ children }: { readonly children: ReactNode }) {
  const [seen] = useState(() => new Set<string>());
  return <SeenScreensContext value={seen}>{children}</SeenScreensContext>;
}

export interface RouteEntrance {
  readonly mode: EntranceMode;
  /** Called by a child that draws the entrance itself. */
  readonly takeOver: () => void;
  /**
   * While the screen is arriving: the value its content column follows to
   * rise. `null` once the entrance is over or when nothing moves.
   */
  readonly rise: EntranceRise | null;
}

export interface EntranceRise {
  readonly progress: SharedValue<number>;
  readonly travel: number;
}

export const RouteEntranceContext = createContext<RouteEntrance | null>(null);

/**
 * Keep the entrance decision stable for this mount; record only committed
 * screens. Without a `screenId` the screen follows the route it is on.
 */
export function useScreenEntrance(screenId: string | undefined, allowed: boolean): EntranceMode {
  const seen = use(SeenScreensContext);
  const route = use(RouteEntranceContext);
  const [firstVisit] = useState(() =>
    screenId === undefined ? route?.mode !== 'none' : !seen?.has(screenId),
  );
  useEffect(() => {
    if (screenId !== undefined) seen?.add(screenId);
  }, [seen, screenId]);
  return allowed && firstVisit ? 'staggered' : 'none';
}

/**
 * For a screen that staggers its own blocks: the route stops moving the screen
 * as one piece, and the screen learns whether this visit is the first.
 */
export function useOwnEntrance(): EntranceMode {
  const route = use(RouteEntranceContext);
  const takeOver = route?.takeOver;
  useLayoutEffect(() => {
    takeOver?.();
  }, [takeOver]);
  return route?.mode ?? 'staggered';
}

/** For the content column: the rise of the screen it was mounted in, if it is still arriving. */
export function useEntranceRise(): EntranceRise | null {
  const route = use(RouteEntranceContext);
  const [rise] = useState(() => route?.rise ?? null);
  return rise;
}
