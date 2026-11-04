/**
 * The season authorization (RAPP-696), a board of screens like Onboarding,
 * with its seasons (RAPP-304, RAPP-614, RAPP-694). The board is Onboarding's
 * own (`FormBoard`), and each card opens its screen in the screen editor's
 * layout, the form beside her phone. The app terms are a form of the engine
 * since RAPP-772 (`CustomFormPage`).
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
  type AuthorizationPhoneStep,
} from '@/components/legal/legal-phone-content';
import { PhoneMiniature } from '@/components/onboarding/phone-preview';
import { FormBoard, type BoardCard } from '@/components/onboarding/screen-board';
import { ScreenEditorHeading, type SiblingScreen } from '@/components/onboarding/screen-editor';
import { AuthorizationEditor } from '@/components/settings/authorization-editor';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { SeasonsPanel } from '@/components/settings/seasons-panel';
import type { LegalFormsData } from '@/lib/legal-forms';
import { supabase } from '@/lib/supabase';
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
import { authorizationQuestions } from '@ramassa/shared/intake-builder';
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
