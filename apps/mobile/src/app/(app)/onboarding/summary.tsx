/**
 * "Are these your details?" (RAPP-300): everything the wizard will save, from
 * staff, a partner entity or her own answers, before she accepts the terms.
 * She confirms, or opens a section to correct it and comes back here. It always
 * shows, even when staff answered everything, because what is stored about her
 * is hers to check.
 *
 * The sections follow the wizard's order as staff arranged it (RAPP-612):
 * built-in screens and staff screens (RAPP-307), each under its title with its
 * own Change button. A built-in question staff removed, or a screen staff hid,
 * shows no row: it is never asked.
 */

import { ReviewEditAction, ReviewRow, ReviewSection } from '@/components/onboarding/review-section';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { SeasonAnswerRows } from '@/components/profile/season-answer-rows';
import { onboardingDraftStore } from '@/lib/onboarding';
import { normalizeDecimalDigits } from '@/lib/onboarding-form';
import {
  mergedCustomAnswers,
  WIZARD_SCREEN_ROUTES,
  wizardStepRoute,
} from '@/lib/onboarding-intake';
import { useBuiltinWording, useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { useScreenTitle } from '@/lib/screen-wording';
import { SEASON_SCREEN_TITLE_KEYS } from '@/lib/season-draft';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Fragment, useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';
import { countryLabelForCanonical } from '@ramassa/shared/i18n/countries';
import { municipalityLabelForCanonical } from '@ramassa/shared/i18n/municipalities';
import {
  customStepId,
  customStepKey,
  DEFAULT_WIZARD_FLOW,
  SEASON_WIZARD_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  wizardFlowOrder,
  type IntakeQuestion,
  type WizardQuestionScreen,
} from '@ramassa/shared/intake';
import {
  answerText,
  isCustomQuestionVisible,
  isEmptyAnswer,
  textIn,
  type CustomAnswers,
  type IntakeScreen,
} from '@ramassa/shared/intake-builder';
import type { OnboardingDraft } from '@ramassa/shared/onboarding-drafts';
import type { LanguageCode } from '@ramassa/shared/schemas';

const DOCUMENT_TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  nie: 'documentTypeNie',
  passport: 'documentTypePassport',
  other: 'documentTypeOther',
  none: 'documentTypeNone',
};

type Section = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function EditButton({
  section,
  title,
  onPress,
}: {
  /** A built-in screen, or `custom-<id>` for a staff screen. */
  readonly section: string;
  readonly title: string;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation('onboarding');
  return (
    <ReviewEditAction
      testID={`onboarding-summary-edit-${section}`}
      label={t('summaryEditLabel', { section: title })}
      onPress={onPress}
    />
  );
}

/** A staff screen with her answers (RAPP-307). */
function CustomSection({
  screen,
  answers,
  language,
}: {
  readonly screen: IntakeScreen;
  readonly answers: CustomAnswers;
  readonly language: LanguageCode;
}) {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const words = {
    yes: t('yesOption'),
    no: t('noOption'),
    maybe: t('customMaybeOption'),
    archived: t('customArchivedOption'),
  };
  const title = textIn(screen.title, language);
  return (
    <ReviewSection
      title={title}
      action={
        <EditButton
          section={`custom-${screen.id}`}
          title={title}
          onPress={() =>
            router.push(`${String(wizardStepRoute(customStepKey(screen.id)))}?edit=1` as Href)
          }
        />
      }
    >
      {screen.questions
        .filter((question) => isCustomQuestionVisible(question, answers))
        .map((question) => {
          const value = answers[question.id];
          return (
            <ReviewRow
              key={question.id}
              label={textIn(question.label, language)}
              value={
                value === undefined || isEmptyAnswer(value)
                  ? t('summaryNotGiven')
                  : answerText(question, value, language, words)
              }
            />
          );
        })}
    </ReviewSection>
  );
}

export default function SummaryStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const router = useRouter();
  const step = useWizardStep('summary');
  const {
    customAnswers,
    hidden,
    customScreens,
    customPlan,
    flow = DEFAULT_WIZARD_FLOW,
  } = useWizardIntake();
  const wording = useBuiltinWording();
  // A section is titled as staff worded its screen (RAPP-612), or as before.
  const screenTitle = useScreenTitle();
  const locale = (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca';
  const [draft, setDraft] = useState<OnboardingDraft | null>(() =>
    onboardingDraftStore.loadDraft(),
  );

  // A correction made on another screen comes back here through router.back(),
  // which shows this same screen again: re-read the draft, or it would show
  // what she just changed.
  useFocusEffect(
    useCallback(() => {
      setDraft(onboardingDraftStore.loadDraft());
    }, []),
  );

  const identity: Section = draft?.identity ?? {};
  const documentation: Section = draft?.documentation ?? {};
  const logistics: Section = draft?.logistics ?? {};
  const season: Section = draft?.season ?? {};
  const notGiven = t('summaryNotGiven');
  const show = (value: string | null) => value ?? notGiven;
  const answers = mergedCustomAnswers(customAnswers, draft?.custom);
  const shows = (question: IntakeQuestion) => !hidden.has(question);
  // A built-in screen whose every question staff removed has nothing to correct.
  const hasQuestions = (screen: WizardQuestionScreen) =>
    WIZARD_SCREEN_QUESTIONS[screen].some(shows);

  const edit = (screen: WizardQuestionScreen) =>
    router.push(`${String(WIZARD_SCREEN_ROUTES[screen])}?edit=1` as Href);

  const birthDate =
    text(identity.day) && text(identity.month) && text(identity.year)
      ? `${text(identity.day)}/${text(identity.month)}/${text(identity.year)}`
      : null;
  const nationality = text(identity.nationality);
  const language = text(identity.preferredLanguage);
  const documentType = text(documentation.documentType);
  const city = text(logistics.city);
  const entity = logistics.referenceEntity === null ? null : text(logistics.referenceEntity);
  const hasDependents = logistics.hasDependents === true;
  const numDependents = text(logistics.numDependents);

  // Each built-in screen's section, placed below in the order staff arranged.
  const seasonSection = (screen: (typeof SEASON_WIZARD_SCREENS)[number]): ReactNode =>
    hasQuestions(screen) ? (
      <ReviewSection
        title={screenTitle(screen, t(SEASON_SCREEN_TITLE_KEYS[screen]))}
        action={
          <EditButton
            section={screen}
            title={screenTitle(screen, t(SEASON_SCREEN_TITLE_KEYS[screen]))}
            onPress={() => edit(screen)}
          />
        }
      >
        <SeasonAnswerRows
          rowComponent={ReviewRow}
          showSeasonNumber={false}
          emptyLabel={notGiven}
          wording={wording}
          shows={(question) =>
            WIZARD_SCREEN_QUESTIONS[screen].includes(question) && shows(question)
          }
          profile={{
            applicant_status: (season.applicantStatus as never) ?? null,
            applicant_status_details: text(season.applicantStatusDetails),
            supporting_entities: Array.isArray(season.supportingEntities)
              ? (season.supportingEntities as string[])
              : null,
            season_number: null,
            childcare_need: (season.childcareNeed as never) ?? null,
            specific_needs: text(season.specificNeeds),
          }}
        />
      </ReviewSection>
    ) : null;
  const sections: Readonly<Partial<Record<WizardQuestionScreen, ReactNode>>> = {
    identity: (
      <ReviewSection
        title={t('summarySectionName')}
        action={
          <EditButton
            section="identity"
            title={t('summarySectionName')}
            onPress={() => edit('identity')}
          />
        }
      >
        <ReviewRow
          icon="person"
          label={wording.label('first_name', t('firstNameLabel'))}
          value={show(text(identity.firstName))}
        />
        <ReviewRow
          icon="person"
          label={wording.label('last_name', t('lastNameLabel'))}
          value={show(text(identity.lastName))}
        />
      </ReviewSection>
    ),
    background: (
      <ReviewSection
        title={screenTitle('background', t('backgroundTitle'))}
        action={
          <EditButton
            section="background"
            title={screenTitle('background', t('backgroundTitle'))}
            onPress={() => edit('background')}
          />
        }
      >
        <ReviewRow
          icon="calendar"
          label={wording.label('date_of_birth', t('dateOfBirthLabel'))}
          value={show(birthDate)}
        />
        <ReviewRow
          icon="location"
          label={wording.label('place_of_birth', t('placeOfBirthLabel'))}
          value={show(text(identity.placeOfBirth))}
        />
        <ReviewRow
          icon="globe"
          label={wording.label('nationality', t('nationalityLabel'))}
          value={show(
            nationality === null
              ? null
              : (countryLabelForCanonical(nationality, locale) ?? nationality),
          )}
        />
        <ReviewRow
          icon="conversation"
          label={wording.label('preferred_language', t('preferredLanguageLabel'))}
          value={show(
            language === null
              ? null
              : (wording.options(
                  'preferred_language',
                  [
                    {
                      value: language,
                      label: LANGUAGE_NATIVE_NAMES[language as LanguageCode] ?? language,
                    },
                  ],
                  language,
                )[0]?.label ?? language),
          )}
        />
      </ReviewSection>
    ),
    documentation: hasQuestions('documentation') ? (
      <ReviewSection
        title={screenTitle('documentation', t('documentationTitle'))}
        action={
          <EditButton
            section="documentation"
            title={screenTitle('documentation', t('documentationTitle'))}
            onPress={() => edit('documentation')}
          />
        }
      >
        <ReviewRow
          icon="document"
          label={wording.label('document', t('documentTypeLabel'))}
          value={show(
            documentType === null
              ? null
              : (wording.options(
                  'document',
                  [
                    {
                      value: documentType,
                      label: t(DOCUMENT_TYPE_LABEL_KEYS[documentType] ?? 'documentTypeOther'),
                    },
                  ],
                  documentType,
                )[0]?.label ?? null),
          )}
        />
        {documentType === 'other' ? (
          <ReviewRow
            label={t('documentNameLabel')}
            value={show(text(documentation.documentName))}
          />
        ) : null}
        {documentType === null || documentType === 'none' ? null : (
          <ReviewRow
            label={t('documentNumberLabel')}
            value={show(text(documentation.documentNumber))}
          />
        )}
      </ReviewSection>
    ) : null,
    logistics: (
      <ReviewSection
        title={screenTitle('logistics', t('logisticsTitle'))}
        action={
          <EditButton
            section="logistics"
            title={screenTitle('logistics', t('logisticsTitle'))}
            onPress={() => edit('logistics')}
          />
        }
      >
        {shows('phone') ? (
          <ReviewRow
            icon="phone"
            label={wording.label('phone', t('phoneLabel'))}
            value={show(text(logistics.phone))}
          />
        ) : null}
        {shows('address') ? (
          <ReviewRow
            icon="home"
            label={wording.label('address', t('addressLabel'))}
            value={show(text(logistics.address))}
          />
        ) : null}
        {shows('city') ? (
          <ReviewRow
            icon="location"
            label={wording.label('city', t('cityLabel'))}
            value={show(
              city === null ? null : (municipalityLabelForCanonical(city, locale) ?? city),
            )}
          />
        ) : null}
        {shows('postal_code') ? (
          <ReviewRow
            icon="location"
            label={wording.label('postal_code', t('postalCodeLabel'))}
            value={show(text(logistics.postalCode))}
          />
        ) : null}
        <ReviewRow
          icon="entity"
          label={wording.label('reference_entity', t('referenceEntityLabel'))}
          value={logistics.referenceEntity === null ? t('referenceEntityNone') : show(entity)}
        />
        {entity === null || !shows('reference_contact_name') ? null : (
          <ReviewRow
            icon="person"
            label={wording.label('reference_contact_name', t('referenceContactNameLabel'))}
            value={show(text(logistics.referenceContactName))}
          />
        )}
        <ReviewRow
          icon="people"
          label={wording.label('dependents', t('hasDependentsLabel'))}
          value={
            logistics.hasDependents === undefined
              ? notGiven
              : hasDependents
                ? t('summaryDependentsYes', {
                    count: Number(normalizeDecimalDigits(numDependents ?? '0')),
                  })
                : t('noOption')
          }
        />
      </ReviewSection>
    ),
    equipment: hasQuestions('equipment') ? (
      <ReviewSection
        title={screenTitle('equipment', t('equipmentTitle'))}
        action={
          <EditButton
            section="equipment"
            title={screenTitle('equipment', t('equipmentTitle'))}
            onPress={() => edit('equipment')}
          />
        }
      >
        {shows('clothing_size') ? (
          <ReviewRow
            icon="clothing"
            label={wording.label('clothing_size', t('clothingSizeLabel'))}
            value={show(text(logistics.clothingSize))}
          />
        ) : null}
        {shows('shoe_size') ? (
          <ReviewRow
            icon="shoes"
            label={wording.label('shoe_size', t('shoeSizeLabel'))}
            value={show(text(logistics.shoeSize))}
          />
        ) : null}
      </ReviewSection>
    ) : null,
    ...Object.fromEntries(SEASON_WIZARD_SCREENS.map((screen) => [screen, seasonSection(screen)])),
  };

  function confirm() {
    onboardingDraftStore.saveDraft({
      ...onboardingDraftStore.loadDraft(),
      currentStep: step.nextDraftStep,
    });
    step.goNext();
  }

  return (
    <WizardFrame
      screenId={'summary'}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('summaryTitle')}
      intro={t('summaryIntro')}
      continueLabel={t('summaryConfirmAction')}
      onContinue={confirm}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              onboardingDraftStore.saveDraft({
                ...onboardingDraftStore.loadDraft(),
                currentStep: step.previousDraftStep ?? 'summary',
              });
              step.goBack?.();
            }
      }
    >
      {wizardFlowOrder(customPlan, flow).map((step) => {
        const customId = customStepId(step);
        const custom =
          customId === null ? undefined : customScreens.find((screen) => screen.id === customId);
        return (
          <Fragment key={step}>
            {custom === undefined ? (
              (sections[step as WizardQuestionScreen] ?? null)
            ) : (
              <CustomSection screen={custom} answers={answers} language={locale} />
            )}
          </Fragment>
        );
      })}
    </WizardFrame>
  );
}
