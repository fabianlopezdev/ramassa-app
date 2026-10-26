/**
 * One registration screen's editor (RAPP-641), opened from its card on the
 * board: `/onboarding/screens/<id>`, where the id is the app screen's name
 * (`identity`, `summary`, `authorization`...) or a Ramassà screen's id.
 *
 * The same guard as the board: Settings' own permission or the onboarding
 * design role (RAPP-615). The authorization screen has nothing to edit here
 * since its text moved to Textos legals (RAPP-694), so its address opens that
 * tab. `ssr: false` for the reason every staff screen
 * gives (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { ScreenEditor } from '@/components/onboarding/screen-editor';
import { ONBOARDING_PERMISSIONS } from '@/lib/nav-items';
import { loadOnboardingDesign } from '@/lib/onboarding-design';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/onboarding/screens/$screenId')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (params.screenId === 'authorization') {
      throw redirect({ to: '/legal', search: { tab: 'authorization' }, replace: true });
    }
  },
  loader: loadOnboardingDesign,
  component: ScreenEditorPage,
});

function ScreenEditorPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={ONBOARDING_PERMISSIONS}>
      <Editor />
    </RequireAuth>
  );
}

function Editor() {
  const data = Route.useLoaderData();
  const { screenId } = Route.useParams();
  return <ScreenEditor data={data} routeId={screenId} />;
}
