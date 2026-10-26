/**
 * The two legal texts' editors, wired to the database (RAPP-694): the season
 * authorization with its seasons (RAPP-304, RAPP-614) and the app terms
 * (RAPP-613). They moved here from the Onboarding area. Each section owns its
 * writes: through the RPC, then a reload of the route, with a fresh
 * authenticator code where the database asks for one (RAPP-235).
 */

import { useStepUp } from '@/components/auth/step-up';
import { AppTermsEditor } from '@/components/settings/app-terms-editor';
import { AuthorizationEditor } from '@/components/settings/authorization-editor';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { SeasonsPanel } from '@/components/settings/seasons-panel';
import { supabase } from '@/lib/supabase';
import {
  discardAuthorizationDraft,
  publishAuthorizationDraft,
  saveAuthorizationDraft,
  type AuthorizationVersion,
} from '@ramassa/shared/authorization';
import {
  discardAppTermsDraft,
  publishAppTermsDraft,
  saveAppTermsDraft,
  type AppTermsVersion,
} from '@ramassa/shared/intake';
import type { IntakeCatalog } from '@ramassa/shared/intake-builder';
import { createSeason, setCurrentSeason, type Season } from '@ramassa/shared/seasons';

/**
 * The seasons and their authorization. Onboarding designers write the draft;
 * only settings.organization publishes it, to the current season or a future
 * one (RAPP-694), because a publish makes every player sign again.
 */
export function AuthorizationSection({
  seasons,
  versions,
  canPublish,
  catalog,
}: {
  readonly seasons: readonly Season[];
  readonly versions: readonly AuthorizationVersion[];
  readonly canPublish: boolean;
  readonly catalog: IntakeCatalog;
}) {
  const reload = useReload();
  const withStepUp = useStepUp();
  return (
    <>
      <SeasonsPanel
        seasons={seasons}
        onCreate={async (input) => {
          await withStepUp(() => createSeason(supabase, input));
          await reload();
        }}
        onSetCurrent={async (seasonId) => {
          await withStepUp(() => setCurrentSeason(supabase, seasonId));
          await reload();
        }}
      />
      <AuthorizationEditor
        versions={versions}
        seasons={seasons}
        canPublish={canPublish}
        catalog={catalog}
        onSaveDraft={async (content) => {
          await saveAuthorizationDraft(supabase, content);
          await reload();
        }}
        onDiscardDraft={async () => {
          await discardAuthorizationDraft(supabase);
          await reload();
        }}
        onPublish={async (seasonId) => {
          const number = await withStepUp(() => publishAuthorizationDraft(supabase, seasonId));
          await reload();
          return number;
        }}
      />
    </>
  );
}

/**
 * The app terms. Onboarding designers write the draft; only
 * settings.organization publishes, because a publish asks every player again.
 */
export function AppTermsSection({
  versions,
  canPublish,
  catalog,
}: {
  readonly versions: readonly AppTermsVersion[];
  readonly canPublish: boolean;
  readonly catalog: IntakeCatalog;
}) {
  const reload = useReload();
  const withStepUp = useStepUp();
  return (
    <AppTermsEditor
      versions={versions}
      canPublish={canPublish}
      catalog={catalog}
      onSaveDraft={async (content) => {
        await saveAppTermsDraft(supabase, content);
        await reload();
      }}
      onDiscardDraft={async () => {
        await discardAppTermsDraft(supabase);
        await reload();
      }}
      onPublish={async () => {
        const number = await withStepUp(() => publishAppTermsDraft(supabase));
        await reload();
        return number;
      }}
    />
  );
}
