import { DataIcon } from '@/components/forms/data-icon';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { appTermsWording } from '@/lib/app-terms-wording';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardIntake, useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';
import type { LanguageCode } from '@ramassa/shared/schemas';

const purposeSymbol: SymbolViewProps['name'] = {
  ios: 'calendar.badge.checkmark',
  android: 'event_available',
  web: 'event_available',
};
const protectedSymbol: SymbolViewProps['name'] = {
  ios: 'lock.shield',
  android: 'shield_lock',
  web: 'shield_lock',
};
const privateSymbol: SymbolViewProps['name'] = {
  ios: 'hand.raised',
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
      <DataIcon name={symbol} />
      <View className="flex-1 gap-xs">
        <Text className={`text-start text-form font-bold text-neutral-900 ${languageFontClass}`}>
          {title}
        </Text>
        <Text className={`text-start text-form leading-body text-neutral-700 ${languageFontClass}`}>
          {body}
        </Text>
      </View>
    </View>
  );
}

/** The point icons in order; a version with more points repeats the last one. */
const POINT_SYMBOLS = [purposeSymbol, protectedSymbol, privateSymbol, controlSymbol] as const;

export function TermsIntroductionStep() {
  const { t, i18n } = useTranslation('onboarding');
  const step = useWizardStep('terms-intro');
  // The current version's introduction (RAPP-613), or the bundled text.
  const wording = appTermsWording(
    useWizardIntake().catalog.terms,
    (i18n.resolvedLanguage as LanguageCode | undefined) ?? 'ca',
    (key) => t(key),
  );
  const persist = (currentStep: OnboardingDraftStep) =>
    onboardingDraftStore.saveDraft({ ...onboardingDraftStore.loadDraft(), currentStep });
  return (
    <WizardFrame
      screenId="terms-intro"
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={wording.introTitle}
      intro={wording.intro}
      continueLabel={t('termsReadFullAction')}
      onContinue={() => {
        persist(step.nextDraftStep);
        step.goNext();
      }}
      onBack={
        step.goBack === null
          ? undefined
          : () => {
              persist(step.previousDraftStep ?? 'summary');
              step.goBack?.();
            }
      }
    >
      <View className="gap-lg">
        {wording.points.map((point, index) => (
          <TermsTrustPoint
            key={index}
            title={point.title}
            body={point.body}
            symbol={POINT_SYMBOLS[Math.min(index, POINT_SYMBOLS.length - 1)]!}
          />
        ))}
      </View>
    </WizardFrame>
  );
}
