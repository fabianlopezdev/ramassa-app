/**
 * The two legal forms (RAPP-696), each a board of screens like Onboarding:
 * the season authorization with its seasons (RAPP-304, RAPP-614, RAPP-694)
 * and the app terms (RAPP-613). The board is Onboarding's own (`FormBoard`),
 * and each card opens its screen in the screen editor's layout, the form
 * beside her phone.
 *
 * Each form owns its writes: through the RPC, then a reload of the route,
 * with a fresh authenticator code where the database asks for one (RAPP-235).
 */

import { useStepUp } from '@/components/auth/step-up';
import {
  FormVersions,
  type FormVersionGroup,
  type FormVersionRow,
} from '@/components/custom-forms/form-versions';
import { Page, PageHeader } from '@/components/layout/page';
import {
  AUTHORIZATION_PHONE_STEPS,
  authorizationPhoneScreen,
  TERMS_PHONE_STEPS,
  termsPhoneScreen,
  type AuthorizationPhoneStep,
  type TermsPhoneStep,
} from '@/components/legal/legal-phone-content';
import { PhoneMiniature } from '@/components/onboarding/phone-preview';
import { FormBoard, type BoardCard } from '@/components/onboarding/screen-board';
import { DeleteScreenAction, type ScreenDeletion } from '@/components/onboarding/screen-deletion';
import { ScreenEditorHeading, type SiblingScreen } from '@/components/onboarding/screen-editor';
import { AppTermsEditor } from '@/components/settings/app-terms-editor';
import { AuthorizationEditor } from '@/components/settings/authorization-editor';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { SeasonsPanel } from '@/components/settings/seasons-panel';
import type { LegalFormsData } from '@/lib/legal-forms';
import { supabase } from '@/lib/supabase';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AUTHORIZATION_MOVABLE_SCREENS,
  authorizationScreenOrder,
  discardAuthorizationDraft,
  isHealthScreenShown,
  publishAuthorizationDraft,
  saveAuthorizationDraft,
  type AuthorizationMovableScreen,
  type AuthorizationVersion,
} from '@ramassa/shared/authorization';
import { AppError } from '@ramassa/shared/errors';
import {
  cleanAppTermsContent,
  discardAppTermsDraft,
  publishAppTermsDraft,
  resolveAppTerms,
  saveAppTermsDraft,
} from '@ramassa/shared/intake';
import {
  authorizationQuestions,
  deleteBuilderScreen,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { createSeason, setCurrentSeason } from '@ramassa/shared/seasons';

/** The content a form's board shows: the draft, else the current version. */
function shownAuthorization(versions: readonly AuthorizationVersion[]) {
  return (
    versions.find((version) => version.publishedAt === null) ??
    versions.find((version) => version.isCurrent) ??
    null
  );
}

/** The authorization's screens in her order: re-registration, the movable two, the signature. */
function authorizationBoardOrder(
  version: Pick<AuthorizationVersion, 'content'> | null,
): readonly AuthorizationPhoneStep[] {
  return [
    'reregistration',
    'reregistrationSeason',
    ...(version === null
      ? AUTHORIZATION_MOVABLE_SCREENS
      : authorizationScreenOrder(version.content)),
  ];
}

// The season authorization -------------------------------------------------------------------------

export function AuthorizationBoard({ data }: { readonly data: LegalFormsData }) {
  const { t, i18n } = useTranslation(['settings', 'onboarding', 'nav']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const withStepUp = useStepUp();
  const shown = shownAuthorization(data.versions);
  const seasonName = data.seasons.find((season) => season.isCurrent)?.name ?? '';
  const card = (step: AuthorizationPhoneStep): BoardCard => {
    // The Health screen shows while staff place any field on it (RAPP-698).
    const isHidden =
      step === 'health' && !isHealthScreenShown(authorizationQuestions(data.intakeCatalog));
    return {
      key: step,
      name: t(`authorizationEditor.phoneStep.${step}`),
      miniature:
        shown === null ? null : (
          <PhoneMiniature
            content={
              authorizationPhoneScreen(shown.content, step, language, t, {
                seasonName,
                catalog: data.intakeCatalog,
              }).content
            }
            language={language}
            isDimmed={isHidden}
          />
        ),
      status: isHidden ? t('onboardingBoard.notShown') : null,
      // Its screens always show and nothing depends on them: no eye and no + (RAPP-761).
      link: { to: '/forms/authorization/$step', params: { step } },
    };
  };
  const order = authorizationBoardOrder(shown);
  const movable = order.filter((step): step is AuthorizationMovableScreen =>
    (AUTHORIZATION_MOVABLE_SCREENS as readonly string[]).includes(step),
  );
  return (
    <Page data-testid="authorization-board-page">
      <PageHeader title={t('nav:staff.authorization')} />
      <FormBoard
        key={movable.join('|')}
        label={t('nav:staff.authorization')}
        leading={(['reregistration', 'reregistrationSeason'] as const).map(card)}
        movable={movable.map(card)}
        trailing={[card('consents')]}
        onReorder={async (keys) => {
          // The order is part of the version: it goes into the draft (RAPP-696).
          if (shown === null) throw new AppError('DB-1', { message: 'no version to reorder' });
          await saveAuthorizationDraft(supabase, {
            ...shown.content,
            screen_order: keys as AuthorizationMovableScreen[],
          });
          await reload();
        }}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <AuthorizationVersions versions={data.versions} seasons={data.seasons} />
        <SeasonsPanel
          seasons={data.seasons}
          onCreate={async (input) => {
            await withStepUp(() => createSeason(supabase, input));
            await reload();
          }}
          onSetCurrent={async (seasonId) => {
            await withStepUp(() => setCurrentSeason(supabase, seasonId));
            await reload();
          }}
        />
      </div>
    </Page>
  );
}

/** The published versions by season (newest season first), and the draft (RAPP-694), in the one versions panel. */
function AuthorizationVersions({
  versions,
  seasons,
}: {
  readonly versions: readonly AuthorizationVersion[];
  readonly seasons: LegalFormsData['seasons'];
}) {
  const { t } = useTranslation('settings');
  const draft = versions.find((version) => version.publishedAt === null) ?? null;
  const currentSeasonId = seasons.find((season) => season.isCurrent)?.id ?? null;
  const groups: FormVersionGroup[] = [];
  for (const version of versions) {
    if (version.publishedAt === null || version.versionNumber === null) continue;
    const seasonId = version.seasonId ?? '';
    const row: FormVersionRow = {
      key: version.id,
      number: version.versionNumber,
      publishedAt: version.publishedAt,
      isCorrection: version.isCorrection,
      isCurrent: version.isCurrent,
    };
    const group = groups.find((each) => each.key === seasonId);
    if (group === undefined) {
      groups.push({
        key: seasonId,
        season: { name: version.seasonName ?? '', isCurrent: seasonId === currentSeasonId },
        versions: [row],
      });
    } else {
      groups[groups.indexOf(group)] = { ...group, versions: [...group.versions, row] };
    }
  }
  return (
    <FormVersions
      title={t('authorizationVersionsTitle')}
      draft={
        draft === null
          ? null
          : { updatedAt: draft.updatedAt ?? new Date().toISOString(), isSeenByTestPlayers: true }
      }
      groups={groups}
      testId="authorization-versions"
    />
  );
}

/** One screen of the authorization, opened from its card. */
export function AuthorizationScreen({
  data,
  step,
}: {
  readonly data: LegalFormsData;
  readonly step: AuthorizationPhoneStep;
}) {
  const { t } = useTranslation(['settings', 'nav']);
  const reload = useReload();
  const withStepUp = useStepUp();
  const order = authorizationBoardOrder(shownAuthorization(data.versions));
  return (
    <Page data-testid="authorization-screen-page">
      <ScreenEditorHeading
        back={{ to: '/forms/authorization', label: t('nav:staff.authorization') }}
        siblings={{
          previous: authorizationSibling(order[order.indexOf(step) - 1], t),
          next: authorizationSibling(order[order.indexOf(step) + 1], t),
        }}
        title={t(`authorizationEditor.phoneStep.${step}`)}
        position={t('onboardingBoard.stepOf', {
          number: order.indexOf(step) + 1,
          total: AUTHORIZATION_PHONE_STEPS.length,
        })}
      />
      <AuthorizationEditor
        step={step}
        versions={data.versions}
        seasons={data.seasons}
        canPublish={data.canPublish}
        catalog={data.intakeCatalog}
        onSaveDraft={async (content) => {
          await saveAuthorizationDraft(supabase, content);
          await reload();
        }}
        onDiscardDraft={async () => {
          await discardAuthorizationDraft(supabase);
          await reload();
        }}
        onPublish={async (seasonId, kind) => {
          const number = await withStepUp(() =>
            publishAuthorizationDraft(supabase, seasonId, kind),
          );
          await reload();
          return number;
        }}
      />
    </Page>
  );
}

// The app terms -------------------------------------------------------------------------------------

export function TermsBoard({ data }: { readonly data: LegalFormsData }) {
  const { t, i18n } = useTranslation(['settings', 'onboarding', 'nav']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const shown =
    data.termsVersions.find((version) => version.versionNumber === null) ??
    data.termsVersions[0] ??
    null;
  const steps = termsSteps(data.intakeCatalog);
  const card = (step: TermsPhoneStep): BoardCard => ({
    key: step,
    name: t(`builtinScreens.screenName.${step}`),
    miniature:
      shown === null ? null : (
        <PhoneMiniature
          content={
            termsPhoneScreen(
              resolveAppTerms(cleanAppTermsContent(shown.content), language),
              step,
              language,
              t,
              data.intakeCatalog,
              undefined,
              steps,
            ).content
          }
          language={language}
          isDimmed={false}
        />
      ),
    status: null,
    // The introduction can go (RAPP-761); the terms she signs always stay.
    ...(step === 'terms-intro' ? { deletion: termsIntroDeletion(t) } : {}),
    link: { to: '/forms/terms/$step', params: { step } },
  });
  return (
    <Page data-testid="terms-board-page">
      <PageHeader title={t('nav:staff.appTerms')} />
      {/* The introduction comes before the terms she signs: both stay in place. */}
      <FormBoard
        label={t('nav:staff.appTerms')}
        movable={[]}
        trailing={steps.map(card)}
        onReorder={async () => undefined}
      />
      <TermsVersions data={data} />
    </Page>
  );
}

function TermsVersions({ data }: { readonly data: LegalFormsData }) {
  const { t } = useTranslation('settings');
  const draft = data.termsVersions.find((version) => version.versionNumber === null) ?? null;
  const published = data.termsVersions.flatMap((version, index): FormVersionRow[] =>
    version.versionNumber === null
      ? []
      : [
          {
            key: version.id,
            number: version.versionNumber,
            publishedAt: version.publishedAt ?? version.updatedAt,
            isCorrection: version.isCorrection,
            // The newest published version is the one in force.
            isCurrent:
              index === data.termsVersions.findIndex((each) => each.versionNumber !== null),
            count: version.acceptanceCount,
          },
        ],
  );
  return (
    <FormVersions
      title={t('appTerms.versionsTitle')}
      draft={draft === null ? null : { updatedAt: draft.updatedAt, isSeenByTestPlayers: true }}
      groups={[{ key: 'all', season: null, versions: published }]}
      testId="app-terms-versions"
    />
  );
}

/** One screen of the app terms, opened from its card, with the screen's own buttons. */
export function TermsScreen({
  data,
  step,
}: {
  readonly data: LegalFormsData;
  readonly step: TermsPhoneStep;
}) {
  const { t } = useTranslation(['settings', 'nav']);
  const reload = useReload();
  const withStepUp = useStepUp();
  const navigate = useNavigate();
  const steps = termsSteps(data.intakeCatalog);
  // A deleted introduction has no editor: back to the board.
  if (!steps.includes(step)) return <Navigate to="/forms/terms" replace />;
  const index = steps.indexOf(step);
  return (
    <Page data-testid="terms-screen-page">
      <ScreenEditorHeading
        back={{ to: '/forms/terms', label: t('nav:staff.appTerms') }}
        siblings={{
          previous: termsSibling(steps[index - 1], t),
          next: termsSibling(steps[index + 1], t),
        }}
        title={t(`builtinScreens.screenName.${step}`)}
        position={t('onboardingBoard.stepOf', { number: index + 1, total: steps.length })}
      />
      <AppTermsEditor
        key={step}
        step={step}
        steps={steps}
        versions={data.termsVersions}
        canPublish={data.canPublish}
        catalog={data.intakeCatalog}
        onSaveDraft={async (content) => {
          await saveAppTermsDraft(supabase, content);
          await reload();
        }}
        onDiscardDraft={async () => {
          await discardAppTermsDraft(supabase);
          await reload();
        }}
        onPublish={async (kind) => {
          const number = await withStepUp(() => publishAppTermsDraft(supabase, kind));
          await reload();
          return number;
        }}
      />
      {step === 'terms-intro' ? (
        <div className="flex justify-end">
          <DeleteScreenAction
            deletion={termsIntroDeletion(t)}
            variant="button"
            onDeleted={() => navigate({ to: '/forms/terms' })}
          />
        </div>
      ) : null}
    </Page>
  );
}

/** The terms' screens she meets: the introduction unless staff deleted it (RAPP-761). */
function termsSteps(catalog: IntakeCatalog): readonly TermsPhoneStep[] {
  const isIntroDeleted = (catalog.screenSettings ?? []).some(
    (settings) => settings.screen === 'terms-intro' && settings.isDeleted,
  );
  return TERMS_PHONE_STEPS.filter((step) => step !== 'terms-intro' || !isIntroDeleted);
}

/** The introduction's delete, as an Onboarding screen's (RAPP-761): nothing depends on it. */
function termsIntroDeletion(t: (key: string) => string): ScreenDeletion {
  return {
    key: 'terms-intro',
    name: t('builtinScreens.screenName.terms-intro'),
    dependents: [],
    run: () => deleteBuilderScreen(supabase, 'onboarding', 'terms-intro', ['terms-intro']),
  };
}

/** An authorization screen next to this one, opening its editor (RAPP-709). */
function authorizationSibling(
  step: AuthorizationPhoneStep | undefined,
  t: (key: string) => string,
): SiblingScreen | null {
  return step === undefined
    ? null
    : {
        name: t(`authorizationEditor.phoneStep.${step}`),
        link: { to: '/forms/authorization/$step', params: { step } },
      };
}

/** An app terms screen next to this one, opening its editor (RAPP-709). */
function termsSibling(
  step: TermsPhoneStep | undefined,
  t: (key: string) => string,
): SiblingScreen | null {
  return step === undefined
    ? null
    : {
        name: t(`builtinScreens.screenName.${step}`),
        link: { to: '/forms/terms/$step', params: { step } },
      };
}
