import { FormTextArea } from '@/components/forms/form-text-area';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardStep } from '@/lib/onboarding-intake-context';
import { mergeSupportNeedsDraft } from '@/lib/support-needs-draft';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextStyle } from 'react-native';
import {
  selectedSupportNeeds,
  SUPPORT_NEED_CATEGORIES,
  SUPPORT_NEED_DETAIL_MAX_LENGTH,
  SUPPORT_NEED_LABEL_KEYS,
  supportNeedsForEditing,
  type SupportNeedCategory,
} from '@ramassa/shared/schemas';

const inputStyle: TextStyle = { writingDirection: 'auto' };
const titleKeys = {
  accessibility: 'supportNeedAccessibilityQuestion',
  health: 'supportNeedHealthQuestion',
  communication: 'supportNeedCommunicationQuestion',
  wellbeing: 'supportNeedWellbeingQuestion',
  other: 'supportNeedOtherQuestion',
} as const;
export function SupportNeedDetailsStep() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  return <Details key={category} category={category} />;
}
function Details({ category }: { readonly category: string | undefined }) {
  const { t } = useTranslation('onboarding');
  const router = useRouter();
  const step = useWizardStep('specific-needs');
  const [answer] = useState(() =>
    supportNeedsForEditing(
      onboardingDraftStore.loadDraft()?.season?.specificNeeds as string | undefined,
    ),
  );
  const selected = selectedSupportNeeds(answer);
  const key = category as SupportNeedCategory;
  const [text, setText] = useState(
    () =>
      answer.explanation ??
      selected
        .map((item) =>
          answer.details[item]
            ? `${t(SUPPORT_NEED_LABEL_KEYS[item])}: ${answer.details[item]}`
            : '',
        )
        .filter(Boolean)
        .join('\n\n'),
  );
  if (!SUPPORT_NEED_CATEGORIES.includes(key) || !selected.includes(key))
    return <Redirect href="/onboarding/specific-needs" />;
  const labels = selected.map((item) => t(SUPPORT_NEED_LABEL_KEYS[item]));
  const needs =
    labels.length > 1
      ? t('supportNeedsListAnd', { first: labels.slice(0, -1).join(', '), last: labels.at(-1) })
      : labels[0];
  const save = (currentStep: Parameters<typeof mergeSupportNeedsDraft>[2]) => {
    const latest = onboardingDraftStore.loadDraft();
    const current = supportNeedsForEditing(latest?.season?.specificNeeds as string | undefined);
    onboardingDraftStore.saveDraft(
      mergeSupportNeedsDraft(latest, { ...current, details: {}, explanation: text }, currentStep),
    );
  };
  return (
    <WizardFrame
      screenId="needs-detail:combined"
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={selected.length > 1 ? t('supportNeedsCombinedQuestion', { needs }) : t(titleKeys[key])}
      continueLabel={t('continueAction')}
      onContinue={() => {
        save(step.nextDraftStep);
        if (step.isEditing) router.replace('/onboarding/summary?entrance=none' as Href);
        else step.goNext();
      }}
      onBack={() => {
        save('specific-needs');
        if (step.isBelow('specific-needs')) router.back();
        else
          router.replace(
            `/onboarding/specific-needs?entrance=none${step.isEditing ? '&edit=1' : ''}` as Href,
          );
      }}
    >
      <FormTextArea
        testID="support-need-details-combined"
        label={t('supportNeedExplanationLabel')}
        value={text}
        onChangeText={setText}
        maxLength={SUPPORT_NEED_DETAIL_MAX_LENGTH}
        style={inputStyle}
      />
    </WizardFrame>
  );
}
