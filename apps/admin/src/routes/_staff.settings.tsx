import { RequireAuth } from '@/components/auth/require-auth';
import { EntityManagementPanel } from '@/components/entity/entity-management-panel';
import { sendMagicLink } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import {
  createManagedEntity,
  fetchEntityCollaborators,
  fetchManagedEntities,
  inviteEntityCollaborator,
  setEntityActive,
  setEntityCollaboratorActive,
} from '@ramassa/shared/entity-management';

export const Route = createFileRoute('/_staff/settings')({
  ssr: false,
  validateSearch: z.object({ entity: z.uuid().optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ entityId: search.entity }),
  loader: async ({ deps }) => {
    const entities = await fetchManagedEntities(supabase);
    const selectedEntityId = entities.some((entity) => entity.id === deps.entityId)
      ? (deps.entityId ?? null)
      : (entities[0]?.id ?? null);
    const collaborators =
      selectedEntityId === null ? [] : await fetchEntityCollaborators(supabase, selectedEntityId);
    return { collaborators, entities, selectedEntityId };
  },
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RequireAuth allow={['admin']}>
      <EntityManagementScreen />
    </RequireAuth>
  );
}

function EntityManagementScreen() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();

  async function refresh() {
    await router.invalidate({ sync: true });
  }

  return (
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
        if (data.selectedEntityId === null) return;
        const invitation = await inviteEntityCollaborator(supabase, data.selectedEntityId, input);
        const result = await sendMagicLink(invitation.email);
        if (!result.ok) throw result.error;
        await refresh();
      }}
      onSetEntityActive={async (entityId, isActive) => {
        await setEntityActive(supabase, entityId, isActive);
        await refresh();
      }}
      onSetCollaboratorActive={async (profileId, isActive) => {
        await setEntityCollaboratorActive(supabase, profileId, isActive);
        await refresh();
      }}
    />
  );
}
