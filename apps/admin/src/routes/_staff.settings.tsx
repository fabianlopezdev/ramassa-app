import { RequireAuth } from '@/components/auth/require-auth';
import { ORGANIZATION_BRANDING_CHANGED_EVENT } from '@/components/branding/organization-branding-provider';
import { EntityManagementPanel } from '@/components/entity/entity-management-panel';
import { OrganizationSettingsPanel } from '@/components/settings/organization-settings-panel';
import { sendMagicLink } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { useAuth } from '@ramassa/shared/auth';
import {
  createManagedEntity,
  fetchEntityCollaborators,
  fetchManagedEntities,
  inviteEntityCollaborator,
  setEntityActive,
  setEntityCollaboratorActive,
} from '@ramassa/shared/entity-management';
import {
  fetchOrganizationSettings,
  fetchStaffMembers,
  inviteStaffMember,
  registerInternalDocument,
  removeStaffMember,
  saveOrganizationSettings,
  searchInternalDocuments,
  setStaffMemberRole,
} from '@ramassa/shared/organization-settings';

export const Route = createFileRoute('/_staff/settings')({
  ssr: false,
  validateSearch: z.object({
    entity: z.uuid().optional().catch(undefined),
    q: z.string().max(120).optional().catch(undefined),
    tab: z.enum(['organization', 'staff', 'documents', 'entities']).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ entityId: search.entity, documentQuery: search.q ?? '' }),
  loader: async ({ deps }) => {
    const [organization, staffMembers, documents, entities] = await Promise.all([
      fetchOrganizationSettings(supabase),
      fetchStaffMembers(supabase),
      searchInternalDocuments(supabase, deps.documentQuery),
      fetchManagedEntities(supabase),
    ]);
    const selectedEntityId = entities.some((entity) => entity.id === deps.entityId)
      ? (deps.entityId ?? null)
      : (entities[0]?.id ?? null);
    const collaborators =
      selectedEntityId === null ? [] : await fetchEntityCollaborators(supabase, selectedEntityId);
    return {
      collaborators,
      documents,
      documentQuery: deps.documentQuery,
      entities,
      organization,
      selectedEntityId,
      staffMembers,
    };
  },
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RequireAuth allow={['admin']}>
      <OrganizationSettingsScreen />
    </RequireAuth>
  );
}

function OrganizationSettingsScreen() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { session } = useAuth();

  async function refresh() {
    await router.invalidate({ sync: true });
  }

  const search = Route.useSearch();
  const entityManagement = (
    <EntityManagementPanel
      entities={data.entities}
      collaborators={data.collaborators}
      selectedEntityId={data.selectedEntityId}
      onSelectEntity={(entityId) =>
        void navigate({ search: { entity: entityId, q: search.q, tab: search.tab } })
      }
      onCreateEntity={async (input) => {
        const entityId = await createManagedEntity(supabase, input);
        await navigate({ search: { entity: entityId, q: search.q, tab: search.tab } });
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

  return (
    <OrganizationSettingsPanel
      organization={data.organization}
      accessToken={session?.access_token}
      staffMembers={data.staffMembers}
      documents={data.documents}
      documentQuery={data.documentQuery}
      entityManagement={entityManagement}
      initialTab={search.tab}
      onTabChange={(tab) =>
        void navigate({ search: { entity: search.entity, q: search.q, tab }, replace: true })
      }
      onSaveOrganization={async (input) => {
        await saveOrganizationSettings(supabase, input);
        window.dispatchEvent(new Event(ORGANIZATION_BRANDING_CHANGED_EVENT));
        await refresh();
      }}
      onInviteStaff={async (input) => {
        const invitation = await inviteStaffMember(supabase, input);
        const result = await sendMagicLink(invitation.email);
        if (!result.ok) throw result.error;
        await refresh();
      }}
      onSetStaffRole={async (profileId, role) => {
        await setStaffMemberRole(supabase, profileId, role);
        await refresh();
      }}
      onRemoveStaff={async (profileId) => {
        await removeStaffMember(supabase, profileId);
        await refresh();
      }}
      onRegisterDocument={async (input) => {
        await registerInternalDocument(supabase, input);
        await refresh();
      }}
      onSearchDocuments={async (query) => {
        await navigate({
          search: {
            entity: search.entity,
            q: query.trim().length === 0 ? undefined : query.trim(),
            tab: 'documents',
          },
        });
      }}
    />
  );
}
