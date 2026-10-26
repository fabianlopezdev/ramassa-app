/**
 * One screen of the app terms (RAPP-696), opened from its card:
 * `/forms/terms/terms-intro` or `/forms/terms/terms`, with the terms' text and
 * the screen's own buttons. An address naming no screen goes back to the
 * board.
 *
 * The same guard as the board. `ssr: false` for the reason every staff
 * screen gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { TermsScreen } from '@/components/legal/legal-forms';
import { TERMS_PHONE_STEPS, type TermsPhoneStep } from '@/components/legal/legal-phone-content';
import { loadLegalForms } from '@/lib/legal-forms';
import { LEGAL_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute, redirect } from '@tanstack/react-router';

function isStep(step: string): step is TermsPhoneStep {
  return (TERMS_PHONE_STEPS as readonly string[]).includes(step);
}

export const Route = createFileRoute('/_staff/forms/terms/$step')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!isStep(params.step)) {
      throw redirect({ to: '/forms/terms', replace: true });
    }
  },
  loader: loadLegalForms,
  component: TermsScreenPage,
});

function TermsScreenPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={LEGAL_FORMS_PERMISSIONS}>
      <Screen />
    </RequireAuth>
  );
}

function Screen() {
  const data = Route.useLoaderData();
  const { step } = Route.useParams();
  return isStep(step) ? <TermsScreen data={data} step={step} /> : null;
}
