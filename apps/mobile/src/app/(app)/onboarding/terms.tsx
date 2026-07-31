/**
 * Wizard step 4 — Termes i consentiments (RAPP-21). The full terms text is
 * readable in the player's language BEFORE anything is tapped; acceptance is
 * an explicit chip, never pre-ticked (RGPD: silence is not consent), and the
 * media consent is visibly separate and optional. Finishing calls the atomic
 * RPC, wipes the on-device draft (the only unencrypted copy of the intake
 * PII), and refreshes the auth profile so the gate flips into the app.
 *
 * Declining ("Ara no") signs out: the app cannot hold a session for someone
 * who has not agreed to it holding their data. The draft is kept, so coming
 * back resumes here rather than starting over.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { logout } from '@/lib/auth';
import { completeOnboarding, onboardingDraftStore } from '@/lib/onboarding';
import {
  documentationFormSchema,
  identityFormSchema,
  logisticsFormSchema,
} from '@/lib/onboarding-form';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { CURRENT_TERMS_VERSION } from '@ramassa/shared/constants';
import { buildCompleteOnboardingPayload, termsStepSchema } from '@ramassa/shared/schemas';
import type { LanguageCode } from '@ramassa/shared/schemas';

export default function TermsStepScreen() {
  const { t, i18n } = useTranslation('onboarding');
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [draft] = useState(() => onboardingDraftStore.loadDraft());

  const savedTerms = (draft?.terms ?? {}) as { termsAccepted?: boolean; mediaConsent?: boolean };
  const [isAccepted, setIsAccepted] = useState(savedTerms.termsAccepted === true);
  const [hasMediaConsent, setHasMediaConsent] = useState(savedTerms.mediaConsent === true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showError, setShowError] = useState<'accept' | 'completion' | null>(null);

  function persist(currentStep: 'logistics' | 'terms') {
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep,
      terms: { termsAccepted: isAccepted, mediaConsent: hasMediaConsent },
    });
  }

  async function finish() {
    if (!isAccepted) {
      setShowError('accept');
      return;
    }
    setShowError(null);
    setIsSubmitting(true);
    try {
      // Every stored step re-parses through the SAME schemas the screens used,
      // so nothing unvalidated can reach the payload even from a tampered or
      // stale draft. A failed parse sends the player back to that step with
      // their data still in the draft, not into a dead end.
      const identity = identityFormSchema.safeParse(draft?.identity ?? {});
      if (!identity.success) {
        router.replace('/onboarding');
        return;
      }
      const documentation = documentationFormSchema.safeParse(draft?.documentation ?? {});
      if (!documentation.success) {
        router.replace('/onboarding/documentation');
        return;
      }
      const logistics = logisticsFormSchema.safeParse(draft?.logistics ?? {});
      if (!logistics.success) {
        router.replace('/onboarding/logistics');
        return;
      }
      const terms = termsStepSchema.parse({
        termsAccepted: true,
        mediaConsent: hasMediaConsent,
      });

      const payload = buildCompleteOnboardingPayload(
        {
          identity: identity.data,
          documentation: documentation.data,
          logistics: logistics.data,
          terms,
        },
        {
          termsVersion: CURRENT_TERMS_VERSION,
          localeShown: (i18n.resolvedLanguage as LanguageCode) ?? 'ca',
        },
      );

      const result = await completeOnboarding(payload);
      if (!result.ok) {
        setShowError('completion');
        return;
      }
      onboardingDraftStore.clearDraft();
      // Flips `needsOnboarding`; the (app) layout's guard then swaps this
      // stack out for the tabs. No manual navigation.
      await refreshProfile();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <WizardFrame
      stepNumber={4}
      title={t('termsTitle')}
      intro={t('termsIntro')}
      continueLabel={t('finishAction')}
      onContinue={() => void finish()}
      isContinueBusy={isSubmitting}
      onBack={() => {
        persist('logistics');
        router.back();
      }}
    >
      <View className="rounded-md bg-neutral-50 p-md">
        <Text className={`text-start text-md leading-6 text-neutral-800 ${languageFontClass}`}>
          {t('termsBody')}
        </Text>
      </View>

      <OptionChip
        label={t('termsAcceptLabel')}
        isSelected={isAccepted}
        onPress={() => {
          setIsAccepted((current) => !current);
          setShowError(null);
        }}
      />
      {showError === 'accept' ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('errorRequired')}
        </Text>
      ) : null}

      <View className="gap-xs">
        <OptionChip
          label={t('mediaConsentLabel')}
          isSelected={hasMediaConsent}
          onPress={() => setHasMediaConsent((current) => !current)}
        />
        <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
          {t('mediaConsentHint')}
        </Text>
      </View>

      {showError === 'completion' ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('completionFailed')}
        </Text>
      ) : null}

      <PressableScale
        accessibilityLabel={t('termsDeclineAction')}
        onPress={() => {
          persist('terms');
          void logout();
        }}
        haptic="selection"
        className="min-h-min items-center justify-center py-sm"
      >
        <Text className={`text-md font-medium text-neutral-500 ${languageFontClass}`}>
          {t('termsDeclineAction')}
        </Text>
      </PressableScale>
    </WizardFrame>
  );
}
