/**
 * Entitats › Formulari de derivació (RAPP-652): what an entity fills in when
 * it refers a woman, composed from Dades de les jugadores. Linked from the
 * Entitats group of the menu (RAPP-654); `/settings?tab=referral-form` still
 * forwards here.
 *
 * Staff who hold settings.organization edit it; the database checks every
 * change again. `ssr: false` for the reason every staff screen gives (the
 * session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { Page, PageHeader } from '@/components/layout/page';
import { ReferralFormEditor } from '@/components/referrals/referral-form-editor';
import { REFERRAL_FORM_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchIntakeCatalog } from '@ramassa/shared/intake-builder';
import { fetchSupportingEntityNames } from '@ramassa/shared/referrals';

export const Route = createFileRoute('/_staff/entities/referral-form')({
  ssr: false,
  loader: async () => {
    const [intakeCatalog, entityNames] = await Promise.all([
      fetchIntakeCatalog(supabase),
      // The preview lists the partner entities; it works without them.
      fetchSupportingEntityNames(supabase).catch(() => []),
    ]);
    return { intakeCatalog, entityNames };
  },
  component: ReferralFormPage,
});

function ReferralFormPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={REFERRAL_FORM_PERMISSIONS}>
      <ReferralFormScreen />
    </RequireAuth>
  );
}

function ReferralFormScreen() {
  const data = Route.useLoaderData();
  const { t } = useTranslation('settings');
  return (
    <Page data-testid="referral-form-page">
      <PageHeader title={t('referralForm.title')} />
      <ReferralFormEditor catalog={data.intakeCatalog} entityNames={data.entityNames} />
    </Page>
  );
}
