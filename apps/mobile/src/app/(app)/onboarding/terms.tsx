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

import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { logout } from '@/lib/auth';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { completeOnboarding, onboardingDraftStore } from '@/lib/onboarding';
import {
  documentationFormSchema,
  identityFormSchema,
  logisticsFormSchema,
} from '@/lib/onboarding-form';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { CURRENT_TERMS_VERSION } from '@ramassa/shared/constants';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { buildCompleteOnboardingPayload, termsStepSchema } from '@ramassa/shared/schemas';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const purposeSymbol: SymbolViewProps['name'] = {
  ios: 'calendar.badge.checkmark',
  android: 'event_available',
  web: 'event_available',
};
const protectedSymbol: SymbolViewProps['name'] = {
  ios: 'lock.shield.fill',
  android: 'shield_lock',
  web: 'shield_lock',
};
const privateSymbol: SymbolViewProps['name'] = {
  ios: 'hand.raised.fill',
  android: 'privacy_tip',
  web: 'privacy_tip',
};
const controlSymbol: SymbolViewProps['name'] = {
  ios: 'slider.horizontal.3',
  android: 'tune',
  web: 'tune',
};

function TermsTrustPoint({
  title,
  body,
  symbol,
}: {
  readonly title: string;
  readonly body: string;
  readonly symbol: SymbolViewProps['name'];
}) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="flex-row items-start gap-sm">
      <View
        accessible={false}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="h-xl w-xl items-center justify-center rounded-full bg-primary-light"
      >
        <SymbolView
          accessible={false}
          name={symbol}
          size={tokens.fontSize.xl}
          tintColor={tokens.colors.primary.dark}
        />
      </View>
      <View className="flex-1 gap-xs">
        <Text className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}>
          {title}
        </Text>
        <Text className={`text-start text-md leading-body text-neutral-600 ${languageFontClass}`}>
          {body}
        </Text>
      </View>
    </View>
  );
}

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
  const [hasAcceptError, setHasAcceptError] = useState(false);
  const [isFullTermsVisible, setIsFullTermsVisible] = useState(false);
  // The FAILURE's own code, not a boolean: it drives the shake and, through the
  // RAPP-12 taxonomy, decides whether the buzz is a warning or an error.
  const [failureCode, setFailureCode] = useState<AppErrorCode | null>(null);

  function persist(currentStep: 'logistics' | 'terms') {
    onboardingDraftStore.saveDraft({
      ...draft,
      currentStep,
      terms: { termsAccepted: isAccepted, mediaConsent: hasMediaConsent },
    });
  }

  async function finish() {
    if (!isAccepted) {
      setHasAcceptError(true);
      // The same warning buzz every rejected wizard submit fires, from the
      // shared vocabulary. Called on every press, not only the first: a player
      // who taps Finish three times must feel the refusal three times.
      playHaptic('warning');
      return;
    }
    setHasAcceptError(false);
    setFailureCode(null);
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
        // The shake and its buzz come from the code, so a system failure feels
        // different from the "you have not ticked the box" refusal above.
        setFailureCode(result.error.code);
        return;
      }
      // The completed primary action of the whole flow (RAPP-70). No animation
      // to pair it with: the auth gate swaps this stack for the tabs the moment
      // the profile refreshes, so the haptic is the confirmation that survives.
      playHaptic('success');
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
      stepNumber={5}
      title={t('termsTitle')}
      intro={t('termsIntro')}
      continueLabel={t('finishAction')}
      onContinue={() => void finish()}
      isContinueBusy={isSubmitting}
      onBack={() => {
        persist('logistics');
        // replace, not back(): a resumed stack has no history (see documentation.tsx).
        router.replace('/onboarding/logistics');
      }}
    >
      <View className="gap-lg">
        <TermsTrustPoint
          title={t('termsPointPurposeTitle')}
          body={t('termsPointPurposeBody')}
          symbol={purposeSymbol}
        />
        <TermsTrustPoint
          title={t('termsPointProtectedTitle')}
          body={t('termsPointProtectedBody')}
          symbol={protectedSymbol}
        />
        <TermsTrustPoint
          title={t('termsPointPrivateTitle')}
          body={t('termsPointPrivateBody')}
          symbol={privateSymbol}
        />
        <TermsTrustPoint
          title={t('termsPointControlTitle')}
          body={t('termsPointControlBody')}
          symbol={controlSymbol}
        />
      </View>

      <PressableScale
        accessibilityLabel={t(isFullTermsVisible ? 'termsHideFullAction' : 'termsReadFullAction')}
        onPress={() => setIsFullTermsVisible((current) => !current)}
        haptic="selection"
        className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
      >
        <Text className={`text-md font-bold text-primary ${languageFontClass}`}>
          {t(isFullTermsVisible ? 'termsHideFullAction' : 'termsReadFullAction')}
        </Text>
      </PressableScale>

      {isFullTermsVisible ? (
        <View style={continuousCorners} className="rounded-md bg-neutral-50 p-md">
          <Text className={`text-start text-md leading-body text-neutral-800 ${languageFontClass}`}>
            {t('termsBody')}
          </Text>
        </View>
      ) : null}

      <OptionChip
        label={t('termsAcceptLabel')}
        isSelected={isAccepted}
        onPress={() => {
          setIsAccepted((current) => !current);
          // Both, as before the errors were split: a message about the last
          // attempt is stale the moment she changes her answer.
          setHasAcceptError(false);
          setFailureCode(null);
        }}
      />
      {/* Its own message, not the form-wide "this is missing": next to a
          consent chip that reads as a statement about a field she cannot see,
          and it is the one refusal in the wizard that has to name the exact
          tap that unblocks it. */}
      {hasAcceptError ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('errorTermsRequired')}
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

      {/* Mounted only while there IS a failure, so it never occupies a slot in
          the parent's gap. The code it carries (contract rule 7) matters more
          here than anywhere: this is the last screen of the intake, so a woman
          stuck on it has no account yet and the code is the only thing staff
          can act on. */}
      {failureCode === null ? null : (
        <FailureNotice code={failureCode} message={t('completionFailed')} />
      )}

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
