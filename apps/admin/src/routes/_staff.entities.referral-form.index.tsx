/**
 * Entitats › Formulari de derivació (RAPP-652, RAPP-938): what an entity
 * fills in when it refers a woman, built on a board of screens like every
 * form. Linked from the Entitats group of the menu (RAPP-654);
 * `/settings?tab=referral-form` still forwards here.
 *
 * Staff who hold settings.organization or onboarding.design edit it
 * (RAPP-965); the database checks every change again. `ssr: false` for the reason every staff screen gives (the
 * session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { Page, PageHeader } from '@/components/layout/page';
import { ReferralFormBoard } from '@/components/referrals/referral-form-board';
import { REFERRAL_FORM_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchIntakeCatalog } from '@ramassa/shared/intake-builder';

export const Route = createFileRoute('/_staff/entities/referral-form/')({
  ssr: false,
  loader: async () => ({ intakeCatalog: await fetchIntakeCatalog(supabase) }),
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
  // Named as the menu names it (RAPP-966).
  const { t } = useTranslation('nav');
  return (
    <Page data-testid="referral-form-page">
      <PageHeader title={t('staff.referralForm')} />
      <ReferralFormBoard catalog={data.intakeCatalog} />
    </Page>
  );
}
