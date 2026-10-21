import { createContext, use, useEffect, useState, type ReactNode } from 'react';

const SeenScreensContext = createContext<Set<string> | null>(null);

/** Lives with the wizard stack, so replacing a route does not forget earlier visits. */
export function OnboardingEntranceProvider({ children }: { readonly children: ReactNode }) {
  const [seen] = useState(() => new Set<string>());
  return <SeenScreensContext value={seen}>{children}</SeenScreensContext>;
}

/** Keep the entrance decision stable for this mount; record only committed screens. */
export function useOnboardingEntrance(screenId: string | undefined, allowed: boolean) {
  const seen = use(SeenScreensContext);
  const [firstVisit] = useState(() => screenId === undefined || !seen?.has(screenId));
  useEffect(() => {
    if (screenId !== undefined) seen?.add(screenId);
  }, [seen, screenId]);
  return allowed && firstVisit ? 'staggered' : 'none';
}
