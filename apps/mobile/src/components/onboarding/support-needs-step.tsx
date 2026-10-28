import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { FieldErrorText } from '@/components/onboarding/field-error-text';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { WizardValidationSummary } from '@/components/onboarding/wizard-validation-summary';
import { followUpShows } from '@/lib/follow-up-screens';
import { playHaptic } from '@/lib/haptics/haptics';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { mergeSupportNeedsDraft } from '@/lib/support-needs-draft';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import {
  selectedSupportNeeds,
  SUPPORT_NEED_CATEGORIES,
  SUPPORT_NEED_LABEL_KEYS,
  supportNeedsForEditing,
  toggleSupportNeed,
} from '@ramassa/shared/schemas';

export function SupportNeedsStep() {
  const { t } = useTranslation('onboarding');
  const step = useWizardStep('specific-needs');
  const { catalog } = useWizardIntake();
  const router = useRouter();
  const fontClass = useLanguageFontClass();
  // Staff can make this question required (RAPP-611): "None" is an answer.
  const [isMissing, setIsMissing] = useState(false);
  const [answer, setAnswer] = useState(() =>
    supportNeedsForEditing(
      onboardingDraftStore.loadDraft()?.season?.specificNeeds as string | undefined,
    ),
  );
  return (
    <WizardFrame
      screenId="specific-needs"
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('supportNeedsTitle')}
      intro={t('supportNeedsChooseMultiple')}
      continueLabel={t('continueAction')}
      onContinue={() => {
        if (
          step.isRequired('specific_needs') &&
          step.shouldAsk('specific_needs') &&
          answer.categories.length === 0
        ) {
          setIsMissing(true);
          playHaptic('warning');
          return;
        }
        const first = selectedSupportNeeds(answer)[0];
        // A follow-up that asks nothing is skipped (RAPP-720).
        if (first && followUpShows(catalog, 'specific-needs-details')) {
          onboardingDraftStore.saveDraft(
            mergeSupportNeedsDraft(
              onboardingDraftStore.loadDraft(),
              answer,
              `needs-detail:${first}`,
            ),
          );
          const route =
            `/onboarding/specific-needs-details/${first}${step.isEditing ? '?edit=1' : ''}` as Href;
          if (step.isEditing) router.replace(route);
          else router.push(route);
        } else {
          onboardingDraftStore.saveDraft(
            mergeSupportNeedsDraft(onboardingDraftStore.loadDraft(), answer, step.nextDraftStep),
          );
          step.goNext();
        }
      }}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              onboardingDraftStore.saveDraft(
                mergeSupportNeedsDraft(
                  onboardingDraftStore.loadDraft(),
                  answer,
                  step.previousDraftStep ?? 'specific-needs',
                ),
              );
              step.goBack?.();
            }
      }
    >
      <WizardValidationSummary isVisible={isMissing} message={t('errorSummary')} />
      <View className="gap-sm" accessibilityLabel={t('supportNeedsTitle')}>
        {[...SUPPORT_NEED_CATEGORIES, 'none' as const].map((category) => (
          <SelectionChoiceCard
            key={category}
            testID={`support-need-${category}`}
            accessibilityRole="checkbox"
            label={t(SUPPORT_NEED_LABEL_KEYS[category])}
            fontClass={fontClass}
            isSelected={answer.categories.includes(category)}
            onPress={() => {
              setAnswer((current) => toggleSupportNeed(current, category));
              setIsMissing(false);
            }}
          />
        ))}
        <FieldErrorText
          testID="onboarding-missing-specific_needs"
          message={isMissing ? t('errorRequired') : undefined}
        />
      </View>
    </WizardFrame>
  );
}
