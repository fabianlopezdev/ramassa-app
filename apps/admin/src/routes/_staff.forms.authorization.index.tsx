/**
 * The season authorization's board (RAPP-696): its screens as cards, in the
 * order her phone walks them, with its versions and the seasons. It replaced
 * the authorization tab of Textos legals (RAPP-694).
 *
 * The same guard as before: Settings' own permission or the onboarding
 * design role. `ssr: false` for the reason every staff screen gives (the
 * session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { AuthorizationBoard } from '@/components/legal/legal-forms';
import { loadLegalForms } from '@/lib/legal-forms';
import { LEGAL_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/authorization/')({
  ssr: false,
  loader: loadLegalForms,
  component: AuthorizationBoardPage,
});

function AuthorizationBoardPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={LEGAL_FORMS_PERMISSIONS}>
      <Board />
    </RequireAuth>
  );
}

function Board() {
  return <AuthorizationBoard data={Route.useLoaderData()} />;
}
