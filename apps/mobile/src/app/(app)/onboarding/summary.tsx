/**
 * "Are these your details?" (RAPP-300): everything the wizard will save, from
 * staff, a partner entity or her own answers, before she accepts the terms.
 * She confirms, or opens a section to correct it and comes back here. It always
 * shows, even when staff answered everything, because what is stored about her
 * is hers to check.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { ProfileRow, ProfileSection } from '@/components/profile/profile-section';
import { onboardingDraftStore } from '@/lib/onboarding';
import { WIZARD_SCREEN_ROUTES } from '@/lib/onboarding-intake';
import { useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { LANGUAGE_NATIVE_NAMES } from '@ramassa/shared/i18n';
import { countryLabelForCanonical } from '@ramassa/shared/i18n/countries';
import { municipalityLabelForCanonical } from '@ramassa/shared/i18n/municipalities';
import type { QuestionScreen } from '@ramassa/shared/intake';
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
  readonly section: QuestionScreen;
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
      <Text className={`text-sm font-semibold text-primary-dark ${languageFontClass}`}>
        {t('summaryEditAction')}
      </Text>
    </PressableScale>
  );
}

export default function SummaryStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const router = useRouter();
  const step = useWizardStep('summary');
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
  const notGiven = t('summaryNotGiven');
  const show = (value: string | null) => value ?? notGiven;

  const edit = (screen: QuestionScreen) =>
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
        <ProfileRow label={t('firstNameLabel')} value={show(text(identity.firstName))} />
        <ProfileRow label={t('lastNameLabel')} value={show(text(identity.lastName))} />
        <EditButton
          section="identity"
          title={t('summarySectionName')}
          onPress={() => edit('identity')}
        />
      </ProfileSection>

      <ProfileSection title={t('backgroundTitle')}>
        <ProfileRow label={t('dateOfBirthLabel')} value={show(birthDate)} />
        <ProfileRow label={t('placeOfBirthLabel')} value={show(text(identity.placeOfBirth))} />
        <ProfileRow
          label={t('nationalityLabel')}
          value={show(
            nationality === null
              ? null
              : (countryLabelForCanonical(nationality, locale) ?? nationality),
          )}
        />
        <ProfileRow
          label={t('preferredLanguageLabel')}
          value={show(
            language === null
              ? null
              : (LANGUAGE_NATIVE_NAMES[language as LanguageCode] ?? language),
          )}
        />
        <EditButton
          section="background"
          title={t('backgroundTitle')}
          onPress={() => edit('background')}
        />
      </ProfileSection>

      <ProfileSection title={t('documentationTitle')}>
        <ProfileRow
          label={t('documentTypeLabel')}
          value={show(
            documentType === null
              ? null
              : t(DOCUMENT_TYPE_LABEL_KEYS[documentType] ?? 'documentTypeOther'),
          )}
        />
        {documentType === 'none' ? null : (
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

      <ProfileSection title={t('logisticsTitle')}>
        <ProfileRow label={t('phoneLabel')} value={show(text(logistics.phone))} />
        <ProfileRow label={t('addressLabel')} value={show(text(logistics.address))} />
        <ProfileRow
          label={t('cityLabel')}
          value={show(city === null ? null : (municipalityLabelForCanonical(city, locale) ?? city))}
        />
        <ProfileRow label={t('postalCodeLabel')} value={show(text(logistics.postalCode))} />
        <ProfileRow
          label={t('referenceEntityLabel')}
          value={logistics.referenceEntity === null ? t('referenceEntityNone') : show(entity)}
        />
        {entity === null ? null : (
          <ProfileRow
            label={t('referenceContactNameLabel')}
            value={show(text(logistics.referenceContactName))}
          />
        )}
        <ProfileRow
          label={t('hasDependentsLabel')}
          value={
            logistics.hasDependents === undefined
              ? notGiven
              : hasDependents
                ? t('summaryDependentsYes', { count: Number(numDependents ?? 0) })
                : t('noOption')
          }
        />
        <ProfileRow label={t('clothingSizeLabel')} value={show(text(logistics.clothingSize))} />
        <ProfileRow label={t('shoeSizeLabel')} value={show(text(logistics.shoeSize))} />
        <EditButton
          section="logistics"
          title={t('logisticsTitle')}
          onPress={() => edit('logistics')}
        />
      </ProfileSection>
    </WizardFrame>
  );
}
