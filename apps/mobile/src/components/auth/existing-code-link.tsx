/**
 * "I already have a code", on the email step of a staging build (RAPP-616).
 * A test account's code is the fixed staging one, so no email is sent: the
 * link goes straight to the code step. Production builds never show it.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

export function ExistingCodeLink({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation('auth');
  const languageFontClass = useLanguageFontClass();
  const label = t('emailOtpExistingCodeAction');
  return (
    <PressableScale
      testID="email-existing-code"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      haptic="selection"
      className="min-h-recommended justify-center self-start px-sm"
    >
      <Text className={`text-form font-semibold text-primary-dark ${languageFontClass}`}>
        {label}
      </Text>
    </PressableScale>
  );
}
