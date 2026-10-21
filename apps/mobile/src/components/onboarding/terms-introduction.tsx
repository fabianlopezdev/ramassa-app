import { DataIcon } from '@/components/forms/data-icon';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { onboardingDraftStore } from '@/lib/onboarding';
import { useWizardStep } from '@/lib/onboarding-intake-context';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import type { SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { OnboardingDraftStep } from '@ramassa/shared/onboarding-drafts';

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

export function TermsIntroductionStep() {
  const { t } = useTranslation('onboarding');
  const step = useWizardStep('terms-intro');
  const persist = (currentStep: OnboardingDraftStep) =>
    onboardingDraftStore.saveDraft({ ...onboardingDraftStore.loadDraft(), currentStep });
  return (
    <WizardFrame
      screenId="terms-intro"
      stepNumber={step.position.step}
      totalSteps={step.position.total}
      title={t('termsIntroTitle')}
      intro={t('termsIntro')}
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
    </WizardFrame>
  );
}
