import { RequireAuth } from '@/components/auth/require-auth';
import { ORGANIZATION_BRANDING_CHANGED_EVENT } from '@/components/branding/organization-branding-provider';
import { EntityManagementPanel } from '@/components/entity/entity-management-panel';
import { OrganizationSettingsPanel } from '@/components/settings/organization-settings-panel';
import { TeamAccessPanel } from '@/components/team/team-access-panel';
import { sendEmailOtp } from '@/lib/auth';
import { SETTINGS_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { resetSecondFactor, signOutEverywhere, useAuth } from '@ramassa/shared/auth';
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
} from '@ramassa/shared/organization-settings';
import {
  applyPermissionPreset,
  deletePermissionPreset,
  fetchMyPermissions,
  fetchTeamAccess,
  restorePermissionPresetDefault,
  savePermissionPreset,
  setTeamMemberPermissions,
} from '@ramassa/shared/permissions';

export const Route = createFileRoute('/_staff/settings')({
  ssr: false,
  validateSearch: z.object({
    entity: z.uuid().optional().catch(undefined),
    q: z.string().max(120).optional().catch(undefined),
    tab: z.enum(['organization', 'staff', 'documents', 'entities']).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ entityId: search.entity, documentQuery: search.q ?? '' }),
  loader: async ({ deps }) => {
    // Each tab loads only for a person who may open it (RAPP-231): a call
    // without its permission is refused by the database. Two round trips, as
    // before permissions existed: a slower page widens the window in which a
    // click lands on the list from before the reload.
    const [permissions, organization] = await Promise.all([
      fetchMyPermissions(supabase),
      fetchOrganizationSettings(supabase),
    ]);
    const canManageEntities = permissions.has('entities.manage');
    const [staffMembers, teamAccess, documents, entities, requestedCollaborators] =
      await Promise.all([
        permissions.has('team.manage') ? fetchStaffMembers(supabase) : Promise.resolve([]),
        permissions.has('team.manage')
          ? fetchTeamAccess(supabase)
          : Promise.resolve({ presets: [], members: [] }),
        permissions.has('settings.documents')
          ? searchInternalDocuments(supabase, deps.documentQuery)
          : Promise.resolve([]),
        canManageEntities ? fetchManagedEntities(supabase) : Promise.resolve([]),
        // The entity in the URL is fetched alongside; a stale or foreign id is
        // simply not used below.
        canManageEntities && deps.entityId !== undefined
          ? fetchEntityCollaborators(supabase, deps.entityId).catch(() => null)
          : Promise.resolve(null),
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
    return {
      collaborators,
      documents,
      documentQuery: deps.documentQuery,
      entities,
      organization,
      selectedEntityId,
      staffMembers,
      teamAccess,
    };
  },
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={SETTINGS_PERMISSIONS}>
      <OrganizationSettingsScreen />
    </RequireAuth>
  );
}

function OrganizationSettingsScreen() {
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const { session, permissions, user, refreshProfile } = useAuth();

  async function refresh() {
    await router.invalidate({ sync: true });
  }

  // A change to the reader's own toggles updates her menus at once.
  async function refreshIfMine(profileIds: readonly string[]) {
    if (user !== null && profileIds.includes(user.id)) await refreshProfile();
    await refresh();
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
        const result = await sendEmailOtp(invitation.email);
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
      onResetCollaboratorSecondFactor={async (profileId) => {
        await resetSecondFactor(supabase, profileId);
        await refresh();
      }}
    />
  );

  const team = (
    <TeamAccessPanel
      members={data.staffMembers}
      access={data.teamAccess.members}
      presets={data.teamAccess.presets}
      myPermissions={permissions}
      onInvite={async ({ presetId, ...person }) => {
        const preset = data.teamAccess.presets.find((candidate) => candidate.id === presetId);
        // The account type follows the preset: Admin makes an admin account,
        // anything else a staff account, which starts on the Staff preset.
        const role = preset?.builtinKey === 'admin' ? 'admin' : 'staff';
        const invitation = await inviteStaffMember(supabase, { ...person, role });
        if (preset !== undefined && preset.builtinKey !== role) {
          await applyPermissionPreset(supabase, preset.id, [invitation.profileId]);
        }
        const result = await sendEmailOtp(invitation.email);
        if (!result.ok) throw result.error;
        await refresh();
      }}
      onSaveMemberAccess={async (input) => {
        await setTeamMemberPermissions(supabase, input);
        await refreshIfMine([input.profileId]);
      }}
      onSavePreset={async (input) => {
        const presetId = await savePermissionPreset(supabase, input);
        await refresh();
        return presetId;
      }}
      onApplyPreset={async (presetId, profileIds) => {
        await applyPermissionPreset(supabase, presetId, profileIds);
        await refreshIfMine(profileIds);
      }}
      onDeletePreset={async (presetId) => {
        await deletePermissionPreset(supabase, presetId);
        await refresh();
      }}
      onRestorePreset={async (presetId) => {
        await restorePermissionPresetDefault(supabase, presetId);
        await refresh();
      }}
      onRemove={async (profileId) => {
        await removeStaffMember(supabase, profileId);
        await refresh();
      }}
      currentUserId={user?.id ?? null}
      onResetSecondFactor={async (profileId) => {
        await resetSecondFactor(supabase, profileId);
        await refresh();
      }}
      onSignOutEverywhere={async (profileId) => {
        await signOutEverywhere(supabase, profileId);
        // Signing herself out ends this tab as well.
        await refreshIfMine([profileId]);
      }}
    />
  );

  return (
    <OrganizationSettingsPanel
      organization={data.organization}
      permissions={permissions}
      team={team}
      accessToken={session?.access_token}
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
