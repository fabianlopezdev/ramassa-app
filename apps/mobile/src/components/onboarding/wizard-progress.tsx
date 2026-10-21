import { AuthBackButton } from '@/components/auth/auth-back-button';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View, type TextStyle } from 'react-native';
import type { SupportedLanguage } from '@ramassa/shared/i18n';

const tabularNumerals: TextStyle = { fontVariant: ['tabular-nums'] };

/** One progress header for the intake and its final season authorization. */
export function WizardProgress({
  step,
  total,
  onBack,
  flowLabel,
  language,
}: {
  readonly step?: number;
  readonly total: number;
  readonly onBack?: () => void;
  readonly flowLabel?: string;
  readonly language?: SupportedLanguage;
}) {
  const { t: translate, i18n } = useTranslation('onboarding');
  const t = language === undefined ? translate : i18n.getFixedT(language, 'onboarding');
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm px-lg pt-sm">
      <View className="min-h-min flex-row items-center justify-between gap-sm">
        {onBack === undefined ? null : <AuthBackButton onPress={onBack} />}
        <Text className={`flex-1 text-start text-form font-bold text-primary ${fontClass}`}>
          {flowLabel ?? (step === undefined ? null : t('appRegistrationFlow'))}
        </Text>
        {step === undefined ? (
          <View />
        ) : (
          <Text
            testID={`wizard-step-${step}`}
            style={tabularNumerals}
            className={`text-form text-neutral-700 ${fontClass}`}
          >
            {t('stepOf', { current: step, total })}
          </Text>
        )}
      </View>
      {step === undefined ? null : (
        <View
          className="flex-row gap-xs"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: total }, (_unused, index) => (
            <View
              key={index}
              className={`h-xs flex-1 rounded-full ${index < step ? 'bg-primary' : 'bg-neutral-200'}`}
            />
          ))}
        </View>
      )}
    </View>
  );
}
