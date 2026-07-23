/**
 * Where each role lands in the ADMIN app (RAPP-13).
 *
 * Players have no admin surface at all, so they get `null` rather than a path.
 * That distinction matters: returning a path for a role that the target area
 * then rejects produces an infinite redirect loop (`/dashboard` -> guard
 * rejects -> `/dashboard` -> ...). A `null` landing tells the caller to show a
 * "no access here" state instead of redirecting.
 *
 * Kept in its own module (no Supabase client import) so it stays a pure,
 * directly testable function.
 */

import type { AppRole } from '@ramassa/shared/schemas';

export type AdminLandingPath = '/dashboard' | '/portal';

export function roleLandingPath(role: AppRole | null): AdminLandingPath | null {
  switch (role) {
    case 'staff':
    case 'admin':
      return '/dashboard';
    case 'entity':
      return '/portal';
    default:
      // 'player' (and an unresolved role) have no admin home.
      return null;
  }
}
