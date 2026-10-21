import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardStep } from '@/lib/onboarding-intake-context';
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
  const router = useRouter();
  const fontClass = useLanguageFontClass();
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
        const first = selectedSupportNeeds(answer)[0];
        if (first) {
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
      <View className="gap-sm" accessibilityLabel={t('supportNeedsTitle')}>
        {[...SUPPORT_NEED_CATEGORIES, 'none' as const].map((category) => (
          <SelectionChoiceCard
            key={category}
            testID={`support-need-${category}`}
            accessibilityRole="checkbox"
            label={t(SUPPORT_NEED_LABEL_KEYS[category])}
            fontClass={fontClass}
            isSelected={answer.categories.includes(category)}
            onPress={() => setAnswer((current) => toggleSupportNeed(current, category))}
          />
        ))}
      </View>
    </WizardFrame>
  );
}
