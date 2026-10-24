import { RequireAuth } from '@/components/auth/require-auth';
import { ORGANIZATION_BRANDING_CHANGED_EVENT } from '@/components/branding/organization-branding-provider';
import {
  OnboardingAppTermsSection,
  OnboardingAuthorizationSection,
  OnboardingDocumentSection,
} from '@/components/settings/onboarding-design-sections';
import {
  isSettingsTab,
  OrganizationSettingsPanel,
  SETTINGS_TABS,
} from '@/components/settings/organization-settings-panel';
import { PhotoHandoffButton } from '@/components/settings/photo-handoff-dialog';
import { MOVED_SETTINGS_TABS } from '@/lib/moved-settings-tabs';
import { SETTINGS_PERMISSIONS } from '@/lib/nav-items';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { useAuth } from '@ramassa/shared/auth';
import { fetchAuthorizationVersions } from '@ramassa/shared/authorization';
import { fetchAppTermsVersions, fetchDocumentStepExplanation } from '@ramassa/shared/intake';
import {
  fetchOrganizationSettings,
  registerInternalDocument,
  saveOrganizationSettings,
  searchInternalDocuments,
} from '@ramassa/shared/organization-settings';
import { fetchMyPermissions } from '@ramassa/shared/permissions';
import { fetchSeasons } from '@ramassa/shared/seasons';

export const Route = createFileRoute('/_staff/settings')({
  ssr: false,
  // The tabs that became pages (Fitxa, the old Questions tab, referral form,
  // team, entities) stay valid here, with the entity, so the staff layout can
  // forward their old links before this page loads (RAPP-654, RAPP-656).
  validateSearch: z.object({
    q: z.string().max(120).optional().catch(undefined),
    tab: z
      .enum([...SETTINGS_TABS, ...MOVED_SETTINGS_TABS])
      .optional()
      .catch(undefined),
    entity: z.uuid().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ documentQuery: search.q ?? '' }),
  loader: async ({ deps }) => {
    // Each tab loads only for a person who may open it (RAPP-231): a call
    // without its permission is refused by the database. Two round trips, as
    // before permissions existed: a slower page widens the window in which a
    // click lands on the list from before the reload.
    const [permissions, organization] = await Promise.all([
      fetchMyPermissions(supabase),
      fetchOrganizationSettings(supabase),
    ]);
    const [documents, documentExplanation, authorizationVersions, seasons, appTermsVersions] =
      await Promise.all([
        permissions.has('settings.documents')
          ? searchInternalDocuments(supabase, deps.documentQuery)
          : Promise.resolve([]),
        permissions.has('settings.organization')
          ? fetchDocumentStepExplanation(supabase)
          : Promise.resolve(null),
        permissions.has('settings.organization')
          ? fetchAuthorizationVersions(supabase)
          : Promise.resolve([]),
        permissions.has('settings.organization') ? fetchSeasons(supabase) : Promise.resolve([]),
        permissions.has('settings.organization')
          ? fetchAppTermsVersions(supabase)
          : Promise.resolve([]),
      ]);
    return {
      appTermsVersions,
      authorizationVersions,
      seasons,
      documentExplanation,
      documents,
      documentQuery: deps.documentQuery,
      organization,
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
  const { session, permissions } = useAuth();

  async function refresh() {
    await router.invalidate({ sync: true });
  }

  const search = Route.useSearch();

  return (
    <OrganizationSettingsPanel
      organization={data.organization}
      permissions={permissions}
      photoHandoff={<PhotoHandoffButton onDone={refresh} />}
      authorization={
        permissions.has('settings.organization') ? (
          <>
            {/* The app terms sit with the other legal text she accepts (RAPP-613). */}
            <OnboardingAppTermsSection versions={data.appTermsVersions} canPublish />
            <OnboardingAuthorizationSection
              seasons={data.seasons}
              versions={data.authorizationVersions}
              canPublish
            />
          </>
        ) : undefined
      }
      documentExplanation={
        permissions.has('settings.organization') ? (
          <OnboardingDocumentSection explanation={data.documentExplanation} />
        ) : undefined
      }
      accessToken={session?.access_token}
      documents={data.documents}
      documentQuery={data.documentQuery}
      initialTab={isSettingsTab(search.tab) ? search.tab : undefined}
      onTabChange={(tab) => void navigate({ search: { q: search.q, tab }, replace: true })}
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
            q: query.trim().length === 0 ? undefined : query.trim(),
            tab: 'documents',
          },
        });
      }}
    />
  );
}
