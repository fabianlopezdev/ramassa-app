/**
 * Entitats › Entitats col·laboradores (RAPP-55): the partner entities and
 * their contacts. A Settings tab until the menu grouped by audience
 * (RAPP-654); `/settings?tab=entities` still forwards here.
 *
 * entities.manage opens it; the database checks every change again, and
 * inviting or switching off a contact asks for a fresh authenticator code
 * first (RAPP-235). `ssr: false` for the reason every staff screen gives (the
 * session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { useStepUp } from '@/components/auth/step-up';
import { EntityManagementPanel } from '@/components/entity/entity-management-panel';
import { Page } from '@/components/layout/page';
import { sendEmailOtp } from '@/lib/auth';
import { ENTITIES_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { resetSecondFactor } from '@ramassa/shared/auth';
import {
  createManagedEntity,
  fetchEntityCollaborators,
  fetchManagedEntities,
  inviteEntityCollaborator,
  setEntityActive,
  setEntityCollaboratorActive,
} from '@ramassa/shared/entity-management';

export const Route = createFileRoute('/_staff/entities/')({
  ssr: false,
  validateSearch: z.object({ entity: z.uuid().optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ entityId: search.entity }),
  loader: async ({ deps }) => {
    const [entities, requestedCollaborators] = await Promise.all([
      fetchManagedEntities(supabase),
      // The entity in the URL is fetched alongside; a stale or foreign id is
      // simply not used below.
      deps.entityId === undefined
        ? Promise.resolve(null)
        : fetchEntityCollaborators(supabase, deps.entityId).catch(() => null),
    ]);
    const selectedEntityId = entities.some((entity) => entity.id === deps.entityId)
      ? (deps.entityId ?? null)
      : (entities[0]?.id ?? null);
    const collaborators =
      selectedEntityId === null
        ? []
        : selectedEntityId === deps.entityId && requestedCollaborators !== null
          ? requestedCollaborators
          : await fetchEntityCollaborators(supabase, selectedEntityId);
    return { entities, selectedEntityId, collaborators };
  },
  component: EntitiesPage,
});

function EntitiesPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={ENTITIES_PERMISSIONS}>
      <EntitiesScreen />
    </RequireAuth>
  );
}

function EntitiesScreen() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const withStepUp = useStepUp();

  async function refresh() {
    await router.invalidate({ sync: true });
  }

  return (
    <Page>
      <EntityManagementPanel
        entities={data.entities}
        collaborators={data.collaborators}
        selectedEntityId={data.selectedEntityId}
        onSelectEntity={(entityId) => void navigate({ search: { entity: entityId } })}
        onCreateEntity={async (input) => {
          const entityId = await createManagedEntity(supabase, input);
          await navigate({ search: { entity: entityId } });
          await refresh();
        }}
        onInvite={async (input) => {
          const entityId = data.selectedEntityId;
          if (entityId === null) return;
          const invitation = await withStepUp(() =>
            inviteEntityCollaborator(supabase, entityId, input),
          );
          const result = await sendEmailOtp(invitation.email);
          if (!result.ok) throw result.error;
          await refresh();
        }}
        onSetEntityActive={async (entityId, isActive) => {
          await setEntityActive(supabase, entityId, isActive);
          await refresh();
        }}
        onSetCollaboratorActive={async (profileId, isActive) => {
          await withStepUp(() => setEntityCollaboratorActive(supabase, profileId, isActive));
          await refresh();
        }}
        onResetCollaboratorSecondFactor={async (profileId) => {
          await withStepUp(() => resetSecondFactor(supabase, profileId));
          await refresh();
        }}
      />
    </Page>
  );
}
