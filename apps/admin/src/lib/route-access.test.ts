import { expect, test } from 'bun:test';
import type { AppRole } from '@ramassa/shared/schemas';
import { resolveRouteAccess } from './route-access';

// The two guarded admin areas (RAPP-13 / RAPP-16).
const STAFF_AREA = ['staff', 'admin'] as const;
const ENTITY_AREA = ['entity'] as const;

const authed = (role: AppRole) =>
  ({ isLoading: false, hasSession: true, role, allow: STAFF_AREA }) as const;

test('a resolving session shows the loading state, never a wrong screen', () => {
  expect(
    resolveRouteAccess({ isLoading: true, hasSession: false, role: null, allow: STAFF_AREA }).kind,
  ).toBe('loading');
  // Loading wins even if a stale role is already present.
  expect(
    resolveRouteAccess({ isLoading: true, hasSession: true, role: 'admin', allow: STAFF_AREA })
      .kind,
  ).toBe('loading');
});

test('no session (or no resolved role) redirects to login', () => {
  expect(resolveRouteAccess({ ...authed('admin'), hasSession: false }).kind).toBe('redirect');
  expect(resolveRouteAccess({ ...authed('admin'), hasSession: false })).toEqual({
    kind: 'redirect',
    to: '/login',
  });
  expect(resolveRouteAccess({ ...authed('admin'), role: null })).toEqual({
    kind: 'redirect',
    to: '/login',
  });
});

test('staff and admin reach the staff area; nobody else does', () => {
  expect(resolveRouteAccess(authed('staff'))).toEqual({ kind: 'allow' });
  expect(resolveRouteAccess(authed('admin'))).toEqual({ kind: 'allow' });
  // An entity user is redirected to their own landing, not shown a forbidden page.
  expect(resolveRouteAccess(authed('entity'))).toEqual({ kind: 'redirect', to: '/portal' });
  // A player has no admin home at all: terminal no-access, never a redirect loop.
  expect(resolveRouteAccess(authed('player'))).toEqual({ kind: 'no-access' });
});

test('only entity users reach the entity area; staff/admin bounce to their dashboard', () => {
  const entityArea = (role: AppRole) =>
    ({ isLoading: false, hasSession: true, role, allow: ENTITY_AREA }) as const;
  expect(resolveRouteAccess(entityArea('entity'))).toEqual({ kind: 'allow' });
  expect(resolveRouteAccess(entityArea('staff'))).toEqual({ kind: 'redirect', to: '/dashboard' });
  expect(resolveRouteAccess(entityArea('admin'))).toEqual({ kind: 'redirect', to: '/dashboard' });
  expect(resolveRouteAccess(entityArea('player'))).toEqual({ kind: 'no-access' });
});
