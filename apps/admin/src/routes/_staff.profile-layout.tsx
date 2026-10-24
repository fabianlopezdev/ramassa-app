/**
 * Organització › Dades de les jugadores (RAPP-650): the player profile layout,
 * the pool every surface picks from. A Settings tab until the menu grouped by
 * audience (RAPP-654); `/settings?tab=profile-layout` still forwards here.
 *
 * Its designers (settings.organization, onboarding.design) edit it; anyone
 * else who may open it reads it. The catalog holds no answers, and who
 * created a field only for the people who design it. `ssr: false` for the
 * reason every staff screen gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { ProfileLayoutPanel } from '@/components/profile-layout/profile-layout-panel';
import { PROFILE_LAYOUT_PERMISSIONS } from '@/lib/nav-items';
import { canDesignProfileLayout } from '@/lib/profile-layout';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@ramassa/shared/auth';
import { fetchIntakeCatalog } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/profile-layout')({
  ssr: false,
  loader: () => fetchIntakeCatalog(supabase),
  component: ProfileLayoutPage,
});

function ProfileLayoutPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={PROFILE_LAYOUT_PERMISSIONS}>
      <ProfileLayoutScreen />
    </RequireAuth>
  );
}

function ProfileLayoutScreen() {
  const catalog = Route.useLoaderData();
  const { permissions } = useAuth();
  return <ProfileLayoutPanel catalog={catalog} canEdit={canDesignProfileLayout(permissions)} />;
}
