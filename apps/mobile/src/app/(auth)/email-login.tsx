import { AuthFormError } from '@/components/auth/auth-form-error';
import { AuthScreen } from '@/components/auth/auth-screen';
import { EmailOtpRequestForm, EmailOtpVerifyForm } from '@/components/auth/email-otp-form';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export default function EmailLoginScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const languageFontClass = useLanguageFontClass();
  const { errorCode, setErrorCode } = useAuthFlowStatus();
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);

  const goBack = () => {
    setErrorCode(null);
    if (sentToEmail) setSentToEmail(null);
    else router.back();
  };

  return (
    <AuthScreen
      title={sentToEmail ? t('auth:emailOtpSentTitle') : t('auth:emailLoginTitle')}
      subtitle={sentToEmail ? t('auth:emailOtpSentBody', { email: sentToEmail }) : undefined}
      onBack={goBack}
    >
      <ShakeOnError errorCode={errorCode}>
        <AuthFormError code={errorCode} />
      </ShakeOnError>

      {sentToEmail ? (
        <View className="gap-md" accessibilityLiveRegion="polite">
          <EmailOtpVerifyForm email={sentToEmail} />
          <PressableScale
            accessibilityLabel={t('common:back')}
            onPress={goBack}
            haptic="selection"
            className="min-h-min items-center justify-center py-sm"
          >
            <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
              {t('common:back')}
            </Text>
          </PressableScale>
        </View>
      ) : (
        <View className="gap-md">
          <EmailOtpRequestForm onSent={setSentToEmail} />
          <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
            {t('auth:emailOtpFreshHint')}
          </Text>
        </View>
      )}
    </AuthScreen>
  );
}
