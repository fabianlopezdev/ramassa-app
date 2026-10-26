/**
 * One registration screen's editor (RAPP-641), opened from its card on the
 * board: `/onboarding/screens/<id>`, where the id is the app screen's name
 * (`identity`, `summary`, `authorization`...) or a Ramassà screen's id.
 *
 * The same guard as the board: Settings' own permission or the onboarding
 * design role (RAPP-615). The app terms and the season authorization are
 * forms of their own (RAPP-696), so their screens' addresses open there.
 * `ssr: false` for the reason every staff screen gives (the session lives in
 * localStorage, ADR-005).
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
      throw redirect({ to: '/forms/authorization', replace: true });
    }
    if (params.screenId === 'terms' || params.screenId === 'terms-intro') {
      throw redirect({
        to: '/forms/terms/$step',
        params: { step: params.screenId },
        replace: true,
      });
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
