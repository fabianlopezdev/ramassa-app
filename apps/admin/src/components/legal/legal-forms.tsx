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
import {
  FormBoard,
  lockedAddDependent,
  lockedHide,
  type BoardCard,
} from '@/components/onboarding/screen-board';
import {
  ScreenEditorHeading,
  WordingSection,
  type SiblingScreen,
} from '@/components/onboarding/screen-editor';
import { AppTermsEditor } from '@/components/settings/app-terms-editor';
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
import {
  cleanAppTermsContent,
  discardAppTermsDraft,
  publishAppTermsDraft,
  resolveAppTerms,
  saveAppTermsDraft,
} from '@ramassa/shared/intake';
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
      hide: lockedHide(t('onboardingBoard.hideLockedLegal')),
      addDependent: lockedAddDependent(t('onboardingBoard.addDependentLockedLegal')),
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

/** The published versions by season (newest season first), and the draft (RAPP-694). */
function AuthorizationVersions({
  versions,
  seasons,
}: {
  readonly versions: readonly AuthorizationVersion[];
  readonly seasons: LegalFormsData['seasons'];
}) {
  const { t, i18n } = useTranslation('settings');
  const draft = versions.find((version) => version.publishedAt === null) ?? null;
  const currentSeasonId = seasons.find((season) => season.isCurrent)?.id ?? null;
  const groups: { seasonId: string; seasonName: string; versions: AuthorizationVersion[] }[] = [];
  for (const version of versions) {
    if (version.publishedAt === null) continue;
    const seasonId = version.seasonId ?? '';
    const group = groups.find((each) => each.seasonId === seasonId);
    if (group === undefined) {
      groups.push({ seasonId, seasonName: version.seasonName ?? '', versions: [version] });
    } else {
      group.versions.push(version);
    }
  }
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
      <h2 className="text-start text-base font-semibold">{t('authorizationVersionsTitle')}</h2>
      {versions.length === 0 ? (
        <p className="text-start text-sm text-muted-foreground">{t('authorizationNoVersions')}</p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="authorization-versions">
          {draft === null ? null : (
            <li className="text-start text-sm" data-testid="authorization-draft-row">
              {t('authorizationEditor.draftRow', {
                date: new Date(draft.updatedAt ?? Date.now()).toLocaleDateString(
                  i18n.resolvedLanguage,
                ),
              })}
              <span
                className="ms-2 rounded border border-dashed px-1.5 py-0.5 text-xs"
                data-testid="authorization-draft-note"
              >
                {t('draftSeenByTestPlayers')}
              </span>
            </li>
          )}
          {groups.map((group) => (
            <li
              key={group.seasonId}
              className="flex flex-col gap-1 pt-2"
              data-testid={`authorization-season-${group.seasonId}`}
            >
              <span className="text-start text-sm font-medium">
                {group.seasonName}
                {group.seasonId === currentSeasonId ? (
                  <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">
                    {t('authorizationCurrentSeasonBadge')}
                  </span>
                ) : null}
              </span>
              <ul className="flex flex-col gap-1 ps-3">
                {group.versions.map((version) => (
                  <li key={version.id} className="text-start text-sm">
                    {t('authorizationVersionInSeason', {
                      number: version.versionNumber,
                      date: new Date(version.publishedAt ?? '').toLocaleDateString(
                        i18n.resolvedLanguage,
                      ),
                    })}
                    {version.isCorrection ? (
                      <VersionBadge label={t('saveDialog.correction')} />
                    ) : null}
                    {version.isCurrent ? (
                      <VersionBadge label={t('authorizationCurrentBadge')} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VersionBadge({ label }: { readonly label: string }) {
  return <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-xs">{label}</span>;
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
            ).content
          }
          language={language}
          isDimmed={false}
        />
      ),
    status: null,
    hide: lockedHide(t('onboardingBoard.hideLockedLegal')),
    addDependent: lockedAddDependent(t('onboardingBoard.addDependentLockedLegal')),
    link: { to: '/forms/terms/$step', params: { step } },
  });
  return (
    <Page data-testid="terms-board-page">
      <PageHeader title={t('nav:staff.appTerms')} />
      {/* The introduction comes before the terms she signs: both stay in place. */}
      <FormBoard
        label={t('nav:staff.appTerms')}
        movable={[]}
        trailing={TERMS_PHONE_STEPS.map(card)}
        onReorder={async () => undefined}
      />
      <TermsVersions data={data} />
    </Page>
  );
}

function TermsVersions({ data }: { readonly data: LegalFormsData }) {
  const { t, i18n } = useTranslation('settings');
  const draft = data.termsVersions.find((version) => version.versionNumber === null) ?? null;
  const published = data.termsVersions.filter((version) => version.versionNumber !== null);
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
      <h2 className="text-start text-base font-semibold">{t('appTerms.versionsTitle')}</h2>
      <ul className="flex flex-col gap-1" data-testid="app-terms-versions">
        {draft === null ? null : (
          <li className="text-start text-sm">
            {t('appTerms.draftRow', {
              date: new Date(draft.updatedAt).toLocaleDateString(i18n.resolvedLanguage),
            })}
            <span
              className="ms-2 rounded border border-dashed px-1.5 py-0.5 text-xs"
              data-testid="app-terms-draft-note"
            >
              {t('draftSeenByTestPlayers')}
            </span>
          </li>
        )}
        {published.map((version, index) => (
          <li key={version.id} className="text-start text-sm">
            {t('appTerms.versionRow', {
              number: version.versionNumber,
              date: new Date(version.publishedAt ?? version.updatedAt).toLocaleDateString(
                i18n.resolvedLanguage,
              ),
              count: version.acceptanceCount,
            })}
            {version.isCorrection ? <VersionBadge label={t('saveDialog.correction')} /> : null}
            {index === 0 ? <VersionBadge label={t('appTerms.currentBadge')} /> : null}
          </li>
        ))}
      </ul>
    </section>
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
  return (
    <Page data-testid="terms-screen-page">
      <ScreenEditorHeading
        back={{ to: '/forms/terms', label: t('nav:staff.appTerms') }}
        siblings={{
          previous: termsSibling(TERMS_PHONE_STEPS[TERMS_PHONE_STEPS.indexOf(step) - 1], t),
          next: termsSibling(TERMS_PHONE_STEPS[TERMS_PHONE_STEPS.indexOf(step) + 1], t),
        }}
        title={t(`builtinScreens.screenName.${step}`)}
        position={t('onboardingBoard.stepOf', {
          number: TERMS_PHONE_STEPS.indexOf(step) + 1,
          total: TERMS_PHONE_STEPS.length,
        })}
      />
      <AppTermsEditor
        key={step}
        step={step}
        versions={data.termsVersions}
        canPublish={data.canPublish}
        catalog={data.intakeCatalog}
        renderWording={(language) => (
          <WordingSection
            catalog={data.intakeCatalog}
            screen={step}
            language={language}
            title={t('onboardingBoard.wording')}
            onChange={() => undefined}
          />
        )}
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
