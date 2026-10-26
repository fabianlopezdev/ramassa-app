/**
 * Textos legals (RAPP-694): the season authorization and the app terms, one
 * tab each, with their drafts, previews, publishing and versions. They moved
 * here from the Onboarding area, because the authorization is renewed every
 * season. The Onboarding board's end tiles open the right tab (`?tab=`).
 *
 * The same guard as the editors had: Settings' own permission or the
 * onboarding design role. `ssr: false` for the reason every staff screen gives
 * (the session lives in localStorage, ADR-005).
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { Page, PageHeader } from '@/components/layout/page';
import { AppTermsSection, AuthorizationSection } from '@/components/legal/legal-text-sections';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LEGAL_TABS, loadLegalTexts, type LegalTab } from '@/lib/legal-texts';
import { LEGAL_TEXTS_PERMISSIONS } from '@/lib/nav-items';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

export const Route = createFileRoute('/_staff/legal')({
  ssr: false,
  validateSearch: z.object({
    tab: z.enum(LEGAL_TABS).optional().catch(undefined),
  }),
  loader: loadLegalTexts,
  component: LegalTextsPage,
});

function LegalTextsPage() {
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={LEGAL_TEXTS_PERMISSIONS}>
      <LegalTexts />
    </RequireAuth>
  );
}

function LegalTexts() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { t } = useTranslation(['settings', 'nav']);
  const tab: LegalTab = search.tab ?? 'authorization';
  return (
    <Page data-testid="legal-texts-page">
      <PageHeader title={t('nav:staff.legal')} />
      <Tabs
        value={tab}
        className="gap-6"
        onValueChange={(value) =>
          void navigate({ search: { tab: value as LegalTab }, replace: true })
        }
      >
        <TabsList className="max-w-full overflow-x-auto" variant="line">
          <TabsTrigger value="authorization" data-testid="legal-tab-authorization">
            {t('onboardingBoard.authorization')}
          </TabsTrigger>
          <TabsTrigger value="terms" data-testid="legal-tab-terms">
            {t('legalPage.terms')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="authorization" className="flex flex-col gap-6">
          <AuthorizationSection
            seasons={data.seasons}
            versions={data.versions}
            canPublish={data.canPublish}
            catalog={data.intakeCatalog}
          />
        </TabsContent>
        <TabsContent value="terms" className="flex flex-col gap-6">
          {/* The terms screen's own buttons stay with the onboarding screens. */}
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link to="/onboarding/screens/$screenId" params={{ screenId: 'terms' }}>
              {t('onboardingBoard.editScreen', { screen: t('builtinScreens.screenName.terms') })}
            </Link>
          </Button>
          <AppTermsSection
            versions={data.termsVersions}
            canPublish={data.canPublish}
            catalog={data.intakeCatalog}
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
