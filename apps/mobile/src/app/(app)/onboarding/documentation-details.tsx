import { AuthTextField } from '@/components/auth/auth-text-field';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { documentDetailsSchemaFor, hasDocumentDetails } from '@/lib/documentation-step';
import { useFollowUpAsking, useOwnField } from '@/lib/follow-up-screens';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  documentDetailScreen,
  type DetailScreen,
  type FollowUpAsking,
} from '@ramassa/shared/intake';
import type { DocumentationStep } from '@ramassa/shared/schemas';

const titleKeys = {
  nie: 'documentNieNumberTitle',
  passport: 'documentPassportNumberTitle',
  other: 'documentOtherDetailsTitle',
} as const;

export default function DocumentDetailsScreen() {
  const { t } = useTranslation('onboarding');
  const fontClass = useLanguageFontClass();
  const step = useWizardStep('documentation');
  const router = useRouter();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());
  const saved = (draft?.documentation ?? {}) as Partial<DocumentationStep>;
  const [hasSubmitErrors, setHasSubmitErrors] = useState(false);
  // Each document's screen asks its own fields as staff placed them (RAPP-720).
  const screen = documentDetailScreen(saved.documentType);
  const asking = useFollowUpAsking();
  const name = useOwnField(screen, 'document_name');
  const number = useOwnField(screen, 'document_number');
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(documentDetailsSchemaFor(asking)),
    defaultValues: {
      documentType: saved.documentType,
      documentName: saved.documentName ?? '',
      documentNumber: saved.documentNumber ?? '',
    },
    mode: 'onBlur',
  });
  const type = saved.documentType;
  if (!hasDocumentDetails(type)) return <Redirect href="/onboarding/documentation" />;
  // Her document's own fields in the order staff placed them; one taken off is not asked.
  const ownOrder = screen === null ? [] : documentFieldOrder(asking[screen]);
  const fieldLabel = (own: typeof name, appLabel: string) =>
    own.asking === 'optional'
      ? t('optionalFieldLabel', { label: own.label(appLabel) })
      : own.label(appLabel);
  const persist = (currentStep: typeof step.nextDraftStep) =>
    onboardingDraftStore.saveDraft({
      ...onboardingDraftStore.loadDraft(),
      currentStep,
      documentation: getValues(),
    });
  const next = handleSubmit(
    () => {
      persist(step.nextDraftStep);
      step.goNext();
    },
    () => {
      setHasSubmitErrors(true);
      playHaptic('warning');
    },
  );
  return (
    <WizardFrame
      // Each answer is its own screen with its own wording (RAPP-715).
      screenId={documentDetailScreen(type) ?? 'documentation-details'}
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t(titleKeys[type])}
      continueLabel={t('continueAction')}
      onContinue={next}
      onBack={() => {
        persist('documentation');
        if (step.isBelow('documentation')) router.back();
        else
          router.replace(
            `/onboarding/documentation?entrance=none${step.isEditing ? '&edit=1' : ''}` as Href,
          );
      }}
    >
      <WizardValidationSummary isVisible={hasSubmitErrors} message={t('errorSummary')} />
      {ownOrder.map((key) =>
        key === 'document_name' ? (
          <View key={key} className="gap-sm">
            <Controller
              control={control}
              name="documentName"
              render={({ field }) => (
                <AuthTextField
                  testID="onboarding-document-name"
                  label={fieldLabel(name, t('documentNameLabel'))}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  errorMessage={errors.documentName ? t('documentNameRequired') : undefined}
                  maxLength={100}
                  autoCapitalize="sentences"
                />
              )}
            />
            <QuestionHelp text={name.help} />
          </View>
        ) : (
          <View key={key} className="gap-sm">
            <Controller
              control={control}
              name="documentNumber"
              render={({ field }) => (
                <AuthTextField
                  testID="onboarding-document-number"
                  label={fieldLabel(number, t('documentNumberLabel'))}
                  value={field.value ?? ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  errorMessage={
                    errors.documentNumber
                      ? t(
                          type === 'nie' && field.value?.trim()
                            ? 'errorNieFormat'
                            : 'documentNumberRequired',
                        )
                      : undefined
                  }
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={50}
                />
              )}
            />
            <QuestionHelp text={number.help} />
          </View>
        ),
      )}
      <Text className={`text-start text-form text-neutral-700 ${fontClass}`}>
        {t('documentReassurance')}
      </Text>
    </WizardFrame>
  );
}

/** The document fields a follow-up asks, in its order. */
function documentFieldOrder(
  asking: FollowUpAsking[DetailScreen],
): readonly ('document_name' | 'document_number')[] {
  return Object.keys(asking).filter(
    (key): key is 'document_name' | 'document_number' =>
      key === 'document_name' || key === 'document_number',
  );
}
