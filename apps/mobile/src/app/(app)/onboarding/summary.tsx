/**
 * "Are these your details?" (RAPP-300): everything the wizard will save, from
 * staff, a partner entity or her own answers, before she accepts the terms.
 * She confirms, or opens a section to correct it and comes back here. It always
 * shows, even when staff answered everything, because what is stored about her
 * is hers to check.
 *
 * Staff's own screens (RAPP-307) show after the built-in step they follow,
 * each under its title with its own Change button. A built-in question staff
 * removed shows no row: it is never asked.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { ProfileRow, ProfileSection } from '@/components/profile/profile-section';
import { SeasonAnswerRows } from '@/components/profile/season-answer-rows';
import { onboardingDraftStore } from '@/lib/onboarding';
import {
  mergedCustomAnswers,
  WIZARD_SCREEN_ROUTES,
  wizardStepRoute,
} from '@/lib/onboarding-intake';
import { useBuiltinWording, useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { SEASON_SCREEN_TITLE_KEYS } from '@/lib/season-draft';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';
import { countryLabelForCanonical } from '@ramassa/shared/i18n/countries';
import { municipalityLabelForCanonical } from '@ramassa/shared/i18n/municipalities';
import {
  customStepKey,
  SEASON_WIZARD_SCREENS,
  WIZARD_SCREEN_QUESTIONS,
  type IntakeQuestion,
  type QuestionScreen,
  type WizardQuestionScreen,
} from '@ramassa/shared/intake';
import {
  answerText,
  isCustomQuestionVisible,
  isEmptyAnswer,
  textIn,
  type CustomAnswers,
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
  const languageFontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={`onboarding-summary-edit-${section}`}
      accessibilityRole="button"
      accessibilityLabel={t('summaryEditLabel', { section: title })}
      onPress={onPress}
      haptic="tapLight"
      className="min-h-recommended justify-center self-start rounded-md border border-primary px-md"
    >
      <Text className={`text-form font-semibold text-primary-dark ${languageFontClass}`}>
        {t('summaryEditAction')}
      </Text>
    </PressableScale>
  );
}

/** The staff screens that follow one built-in step, each with her answers (RAPP-307). */
function CustomSections({
  after,
  answers,
  language,
}: {
  readonly after: QuestionScreen;
  readonly answers: CustomAnswers;
  readonly language: LanguageCode;
}) {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const { customScreens } = useWizardIntake();
  const words = {
    yes: t('yesOption'),
    no: t('noOption'),
    maybe: t('customMaybeOption'),
    archived: t('customArchivedOption'),
  };
  return (
    <>
      {customScreens
        .filter((screen) => screen.afterScreen === after)
        .map((screen) => {
          const title = textIn(screen.title, language);
          return (
            <ProfileSection key={screen.id} title={title}>
              {screen.questions
                .filter((question) => isCustomQuestionVisible(question, answers))
                .map((question) => {
                  const value = answers[question.id];
                  return (
                    <ProfileRow
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
              <EditButton
                section={`custom-${screen.id}`}
                title={title}
                onPress={() =>
                  router.push(`${String(wizardStepRoute(customStepKey(screen.id)))}?edit=1` as Href)
                }
              />
            </ProfileSection>
          );
        })}
    </>
  );
}

export default function SummaryStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const router = useRouter();
  const step = useWizardStep('summary');
  const { customAnswers, hidden } = useWizardIntake();
  const wording = useBuiltinWording();
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

  function confirm() {
    onboardingDraftStore.saveDraft({
      ...(draft ?? {}),
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
                ...(draft ?? {}),
                currentStep: step.previousDraftStep ?? 'summary',
              });
              step.goBack?.();
            }
      }
    >
      <ProfileSection title={t('summarySectionName')}>
        <ProfileRow
          label={wording.label('first_name', t('firstNameLabel'))}
          value={show(text(identity.firstName))}
        />
        <ProfileRow
          label={wording.label('last_name', t('lastNameLabel'))}
          value={show(text(identity.lastName))}
        />
        <EditButton
          section="identity"
          title={t('summarySectionName')}
          onPress={() => edit('identity')}
        />
      </ProfileSection>
      <CustomSections after="identity" answers={answers} language={locale} />

      <ProfileSection title={t('backgroundTitle')}>
        <ProfileRow
          label={wording.label('date_of_birth', t('dateOfBirthLabel'))}
          value={show(birthDate)}
        />
        <ProfileRow
          label={wording.label('place_of_birth', t('placeOfBirthLabel'))}
          value={show(text(identity.placeOfBirth))}
        />
        <ProfileRow
          label={wording.label('nationality', t('nationalityLabel'))}
          value={show(
            nationality === null
              ? null
              : (countryLabelForCanonical(nationality, locale) ?? nationality),
          )}
        />
        <ProfileRow
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
        <EditButton
          section="background"
          title={t('backgroundTitle')}
          onPress={() => edit('background')}
        />
      </ProfileSection>
      <CustomSections after="background" answers={answers} language={locale} />

      {hasQuestions('documentation') ? (
        <ProfileSection title={t('documentationTitle')}>
          <ProfileRow
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
            <ProfileRow
              label={t('documentNameLabel')}
              value={show(text(documentation.documentName))}
            />
          ) : null}
          {documentType === null || documentType === 'none' ? null : (
            <ProfileRow
              label={t('documentNumberLabel')}
              value={show(text(documentation.documentNumber))}
            />
          )}
          <EditButton
            section="documentation"
            title={t('documentationTitle')}
            onPress={() => edit('documentation')}
          />
        </ProfileSection>
      ) : null}
      <CustomSections after="documentation" answers={answers} language={locale} />

      <ProfileSection title={t('logisticsTitle')}>
        {shows('phone') ? (
          <ProfileRow
            label={wording.label('phone', t('phoneLabel'))}
            value={show(text(logistics.phone))}
          />
        ) : null}
        {shows('address') ? (
          <ProfileRow
            label={wording.label('address', t('addressLabel'))}
            value={show(text(logistics.address))}
          />
        ) : null}
        {shows('city') ? (
          <ProfileRow
            label={wording.label('city', t('cityLabel'))}
            value={show(
              city === null ? null : (municipalityLabelForCanonical(city, locale) ?? city),
            )}
          />
        ) : null}
        {shows('postal_code') ? (
          <ProfileRow
            label={wording.label('postal_code', t('postalCodeLabel'))}
            value={show(text(logistics.postalCode))}
          />
        ) : null}
        <ProfileRow
          label={wording.label('reference_entity', t('referenceEntityLabel'))}
          value={logistics.referenceEntity === null ? t('referenceEntityNone') : show(entity)}
        />
        {entity === null || !shows('reference_contact_name') ? null : (
          <ProfileRow
            label={wording.label('reference_contact_name', t('referenceContactNameLabel'))}
            value={show(text(logistics.referenceContactName))}
          />
        )}
        <ProfileRow
          label={wording.label('dependents', t('hasDependentsLabel'))}
          value={
            logistics.hasDependents === undefined
              ? notGiven
              : hasDependents
                ? t('summaryDependentsYes', { count: Number(numDependents ?? 0) })
                : t('noOption')
          }
        />
        <EditButton
          section="logistics"
          title={t('logisticsTitle')}
          onPress={() => edit('logistics')}
        />
      </ProfileSection>
      {hasQuestions('equipment') ? (
        <ProfileSection title={t('equipmentTitle')}>
          {shows('clothing_size') ? (
            <ProfileRow
              label={wording.label('clothing_size', t('clothingSizeLabel'))}
              value={show(text(logistics.clothingSize))}
            />
          ) : null}
          {shows('shoe_size') ? (
            <ProfileRow
              label={wording.label('shoe_size', t('shoeSizeLabel'))}
              value={show(text(logistics.shoeSize))}
            />
          ) : null}
          <EditButton
            section="equipment"
            title={t('equipmentTitle')}
            onPress={() => edit('equipment')}
          />
        </ProfileSection>
      ) : null}
      <CustomSections after="logistics" answers={answers} language={locale} />

      {/* The registration questions (RAPP-306), from her draft like the rest. */}
      {SEASON_WIZARD_SCREENS.map((screen) =>
        hasQuestions(screen) ? (
          <ProfileSection key={screen} title={t(SEASON_SCREEN_TITLE_KEYS[screen])}>
            <SeasonAnswerRows
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
            <EditButton
              section={screen}
              title={t(SEASON_SCREEN_TITLE_KEYS[screen])}
              onPress={() => edit(screen)}
            />
          </ProfileSection>
        ) : null,
      )}
      <CustomSections after="season" answers={answers} language={locale} />
    </WizardFrame>
  );
}
