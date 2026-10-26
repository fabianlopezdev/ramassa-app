/**
 * The app terms' board (RAPP-696): "Abans dels termes" and "Termes i
 * signatura" as cards, with the versions. The screens moved here from the
 * Onboarding board, which shows one linked card for the whole form; her phone
 * walks them in the same place of her onboarding as before.
 *
 * The same guard as before: Settings' own permission or the onboarding
 * design role. `ssr: false` for the reason every staff screen gives (the
 * session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { TermsBoard } from '@/components/legal/legal-forms';
import { loadLegalForms } from '@/lib/legal-forms';
import { LEGAL_FORMS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/forms/terms/')({
  ssr: false,
  loader: loadLegalForms,
  component: TermsBoardPage,
});

function TermsBoardPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={LEGAL_FORMS_PERMISSIONS}>
      <Board />
    </RequireAuth>
  );
}

function Board() {
  return <TermsBoard data={Route.useLoaderData()} />;
}
