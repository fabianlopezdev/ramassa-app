/** Document choice first; only documents that have details open another page. */
import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { continuousCorners } from '@/lib/continuous-corners';
import {
  documentationForChoice,
  hasDocumentDetails,
  type DocumentChoice,
} from '@/lib/documentation-step';
import { followUpShows } from '@/lib/follow-up-screens';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useBuiltinWording, useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import {
  documentDetailScreen,
  documentExplanationFor,
  offersSkipAnswer,
} from '@ramassa/shared/intake';
import { DOCUMENT_TYPES, type DocumentationStep, type LanguageCode } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const labelKeys = {
  nie: 'documentTypeNie',
  passport: 'documentTypePassport',
  other: 'documentTypeOther',
  none: 'documentTypeNone',
} as const;

export default function DocumentationStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const fontClass = useLanguageFontClass();
  const step = useWizardStep('documentation');
  const router = useRouter();
  const wording = useBuiltinWording();
  const { documentExplanation, catalog } = useWizardIntake();
  const explanation = documentExplanationFor(
    documentExplanation,
    (i18n.resolvedLanguage as LanguageCode) ?? 'ca',
  );
  const { fontScale } = useWindowDimensions();
  const rowStyle = useMemo(
    () => ({
      ...continuousCorners,
      minHeight:
        tokens.formField.minHeight * Math.max(1, fontScale) -
        tokens.languageChoice.shadowBlockOffset,
    }),
    [fontScale],
  );
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const saved = (draft?.documentation ?? {}) as Partial<DocumentationStep>;
  const [choice, setChoice] = useState<DocumentChoice | undefined>(saved.documentType);
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);
  const options = [
    ...wording.options(
      'document',
      DOCUMENT_TYPES.map((value) => ({ value, label: t(labelKeys[value]) })),
      choice === 'skip' ? null : (choice ?? null),
    ),
    // "Not now" is no answer: staff can make the document required (RAPP-611).
    ...(offersSkipAnswer('document', step.required)
      ? [{ value: 'skip' as const, label: t('documentSkipAction') }]
      : []),
  ];
  const persist = (currentStep: typeof step.nextDraftStep) => {
    const latest = onboardingDraftStore.loadDraft();
    const current = (latest?.documentation ?? {}) as Partial<DocumentationStep>;
    onboardingDraftStore.saveDraft({
      ...latest,
      currentStep,
      documentation: choice === undefined ? current : documentationForChoice(choice, current),
    });
  };
  const continueFromChoice = () => {
    if (choice === undefined || (choice === 'skip' && step.isRequired('document'))) {
      setHasSubmitErrors(true);
      playHaptic('warning');
      return;
    }
    // A follow-up that asks nothing is skipped (RAPP-720).
    const detail = documentDetailScreen(choice);
    if (hasDocumentDetails(choice) && detail !== null && followUpShows(catalog, detail)) {
      persist('documentation-details');
      const route = `/onboarding/documentation-details${step.isEditing ? '?edit=1' : ''}` as Href;
      if (step.isEditing) router.replace(route);
      else router.push(route);
    } else {
      persist(step.nextDraftStep);
      step.goNext();
    }
  };
  return (
    <WizardFrame
      screenId="documentation"
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('documentationTitle')}
      intro={t('documentationIntro')}
      continueLabel={t('continueAction')}
      onContinue={continueFromChoice}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? 'documentation');
              step.goBack?.();
            }
      }
    >
      {explanation === null ? null : (
        <Text
          testID="onboarding-document-explanation"
          className={`text-start text-form text-neutral-700 ${fontClass}`}
        >
          {explanation}
        </Text>
      )}
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('documentChooseError')} />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={wording.label('document', t('documentTypeLabel'))}
        className="gap-sm"
      >
        <Text className={`text-start text-form font-medium text-neutral-800 ${fontClass}`}>
          {wording.label('document', t('documentTypeLabel'))}
        </Text>
        <QuestionHelp text={wording.help('document')} />
        {options.map((option) => (
          <SelectionChoiceCard
            key={option.value}
            testID={`onboarding-document-${option.value}`}
            label={option.label}
            fontClass={fontClass}
            rowStyle={rowStyle}
            isSelected={choice === option.value}
            onPress={() => {
              setChoice(option.value as DocumentChoice);
              setHasSubmitErrors(false);
            }}
          />
        ))}
      </View>
    </WizardFrame>
  );
}
