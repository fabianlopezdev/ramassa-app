/**
 * The pure decision behind the admin route guard (RAPP-13 / RAPP-16).
 *
 * `RequireAuth` renders one of four outcomes for a given role and area; this
 * function computes which, with no React or router dependency, so the whole
 * role x area matrix (staff/admin/entity/player against the staff and entity
 * areas) is exhaustively unit-testable. Kept a pure module for the same reason
 * `roleLandingPath` is (see role-landing.ts).
 *
 * This is a UX gate, NOT the authorization boundary: Postgres RLS (ADR-009) is
 * what actually protects data, so a bypass here exposes nothing. The admin
 * session lives in localStorage (RAPP-13), so `hasSession`/`role` are only ever
 * known in the browser and this runs client-side.
 */

import type { AppRole } from '@ramassa/shared/schemas';
import { roleLandingPath, type AdminLandingPath } from './role-landing';

export type RouteAccess =
  | { readonly kind: 'loading' }
  | { readonly kind: 'redirect'; readonly to: '/login' | AdminLandingPath }
  | { readonly kind: 'no-access' }
  | { readonly kind: 'allow' };

export function resolveRouteAccess(input: {
  readonly isLoading: boolean;
  readonly hasSession: boolean;
  readonly role: AppRole | null;
  readonly allow: readonly AppRole[];
}): RouteAccess {
  const { isLoading, hasSession, role, allow } = input;

  // While the persisted session resolves, show loading so no wrong screen flashes.
  if (isLoading) {
    return { kind: 'loading' };
  }
  // Signed out (or role not yet known): back to login.
  if (!hasSession || !role) {
    return { kind: 'redirect', to: '/login' };
  }
  // Signed in but outside this area: send the user to their own landing, or, if
  // they have no admin home (a player), a terminal no-access state. Redirecting
  // a player to a landing this guard would reject again is what produced the
  // /dashboard -> /dashboard loop role-landing.ts guards against.
  if (!allow.includes(role)) {
    const landing = roleLandingPath(role);
    return landing === null ? { kind: 'no-access' } : { kind: 'redirect', to: landing };
  }
  return { kind: 'allow' };
}
