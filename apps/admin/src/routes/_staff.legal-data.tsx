/**
 * Dades › Dades legals (RAPP-699): the consents defined once, the signature
 * blocks and the documents accepted, each with the forms that ask it.
 *
 * The same people as Dades de les jugadores open it and edit it. `ssr: false`
 * for the reason every staff screen gives (the session lives in localStorage,
 * ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { LegalDataPanel } from '@/components/legal/legal-data-panel';
import { PROFILE_LAYOUT_PERMISSIONS } from '@/lib/nav-items';
import { canDesignProfileLayout } from '@/lib/profile-layout';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '@ramassa/shared/auth';
import { fetchIntakeCatalog } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/legal-data')({
  ssr: false,
  loader: () => fetchIntakeCatalog(supabase),
  component: LegalDataPage,
});

function LegalDataPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={PROFILE_LAYOUT_PERMISSIONS}>
      <LegalDataScreen />
    </RequireAuth>
  );
}

function LegalDataScreen() {
  const catalog = Route.useLoaderData();
  const { permissions } = useAuth();
  return <LegalDataPanel catalog={catalog} canEdit={canDesignProfileLayout(permissions)} />;
}
