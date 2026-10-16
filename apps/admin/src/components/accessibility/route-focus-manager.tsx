import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

/**
 * Moves keyboard focus into the page after a navigation to another path, so a
 * keyboard or screen reader user starts at the new content. Only a real page
 * change counts (RAPP-437): TanStack Router 1.170+ also reports a render for
 * the first load and for data reloads on the same page, and focusing then
 * took focus off the skip link the user had just reached.
 */
export function RouteFocusManager({ targetId }: { readonly targetId: string }) {
  const router = useRouter();

  useEffect(
    () =>
      router.subscribe('onRendered', (event) => {
        if (event.fromLocation === undefined || !event.pathChanged) return;
        document.getElementById(targetId)?.focus();
      }),
    [router, targetId],
  );

  return null;
}
