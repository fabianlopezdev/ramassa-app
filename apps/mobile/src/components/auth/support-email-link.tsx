import { PressableScale } from '@/components/motion/pressable-scale';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';
import { SUPPORT_EMAIL } from '@ramassa/shared/constants';
import { openSupportEmail } from './support-email';

type SupportEmailLinkProps = {
  readonly email?: string | null;
};

export function SupportEmailLink({ email = SUPPORT_EMAIL }: SupportEmailLinkProps) {
  const { t } = useTranslation('auth');
  const languageFontClass = useLanguageFontClass();
  const [showFallback, setShowFallback] = useState(false);

  const supportEmail = email;
  if (!supportEmail) return null;

  const handlePress = async () => {
    setShowFallback(!(await openSupportEmail(supportEmail, Linking)));
  };

  return (
    <View className="items-center gap-xs">
      <PressableScale
        accessibilityLabel={t('supportPrompt', { email: supportEmail })}
        accessibilityRole="link"
        onPress={() => void handlePress()}
        haptic="selection"
        className="min-h-min items-center justify-center px-sm py-sm"
      >
        <Text className={`text-center text-sm text-primary ${languageFontClass}`}>
          {t('supportPrompt', { email: supportEmail })}
        </Text>
      </PressableScale>
      {showFallback ? (
        <Text selectable className={`text-center text-sm text-neutral-600 ${languageFontClass}`}>
          {supportEmail}
        </Text>
      ) : null}
    </View>
  );
}
