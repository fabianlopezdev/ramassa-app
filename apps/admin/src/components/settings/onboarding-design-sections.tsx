/**
 * The onboarding settings' shared reload (RAPP-615): a save goes through its
 * RPC, then the route reloads. The note under the document step became the
 * Documentació screen's help (RAPP-721).
 */

import { useRouter } from '@tanstack/react-router';

export function useReload() {
  const router = useRouter();
  return () => router.invalidate({ sync: true });
}
