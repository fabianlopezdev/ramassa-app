/**
 * Client-side route guard (RAPP-13). The admin's session lives in localStorage,
 * so it is only known in the browser; this guard runs there. It is a UX gate,
 * NOT the authorization boundary — Postgres RLS (ADR-009) is what actually
 * protects data, so a guard bypass exposes nothing.
 *
 * While the session resolves it shows a loading state (no flash of the wrong
 * screen); with no session it redirects to login; with a role outside `allow`
 * it redirects that user to their own landing instead of showing a forbidden
 * area.
 */

import { NoAdminAccess } from '@/components/auth/no-admin-access';
import { roleLandingPath } from '@/lib/role-landing';
import { Navigate } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import type { AppRole } from '@ramassa/shared/schemas';
import { AuthLoading } from './auth-loading';

export function RequireAuth({
  allow,
  children,
}: {
  allow: readonly AppRole[];
  children: ReactNode;
}) {
  const { t } = useTranslation('auth');
  const { session, role, isLoading } = useAuth();

  if (isLoading) {
    return <AuthLoading label={t('signingIn')} />;
  }
  if (!session || !role) {
    return <Navigate to="/login" />;
  }
  if (!allow.includes(role)) {
    const landing = roleLandingPath(role);
    // No admin home for this role (a player): show a terminal "no access"
    // state. Redirecting to a landing this same guard would reject again is
    // what produced an infinite /dashboard -> /dashboard loop.
    return landing === null ? <NoAdminAccess /> : <Navigate to={landing} />;
  }
  return <>{children}</>;
}
