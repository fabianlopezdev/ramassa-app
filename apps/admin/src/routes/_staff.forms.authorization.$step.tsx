/**
 * One screen of the season authorization (RAPP-696), opened from its card:
 * `/forms/authorization/<screen>`. An address naming no screen goes back to
 * the board.
 *
 * The same guard as the board. `ssr: false` for the reason every staff
 * screen gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { AuthorizationScreen } from '@/components/legal/legal-forms';
import {
  AUTHORIZATION_PHONE_STEPS,
  type AuthorizationPhoneStep,
} from '@/components/legal/legal-phone-content';
import { loadLegalForms } from '@/lib/legal-forms';
import { LEGAL_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute, redirect } from '@tanstack/react-router';

function isStep(step: string): step is AuthorizationPhoneStep {
  return (AUTHORIZATION_PHONE_STEPS as readonly string[]).includes(step);
}

export const Route = createFileRoute('/_staff/forms/authorization/$step')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!isStep(params.step)) {
      throw redirect({ to: '/forms/authorization', replace: true });
    }
  },
  loader: loadLegalForms,
  component: AuthorizationScreenPage,
});

function AuthorizationScreenPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={LEGAL_FORMS_PERMISSIONS}>
      <Screen />
    </RequireAuth>
  );
}

function Screen() {
  const data = Route.useLoaderData();
  const { step } = Route.useParams();
  return isStep(step) ? <AuthorizationScreen key={step} data={data} step={step} /> : null;
}
