import { AuthFormError } from '@/components/auth/auth-form-error';
import type { AuthFormLayout } from '@/components/auth/auth-form-layout';
import { AuthScreen } from '@/components/auth/auth-screen';
import { EmailOtpRequestForm, EmailOtpVerifyForm } from '@/components/auth/email-otp-form';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function EmailLoginScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const { errorCode, setErrorCode } = useAuthFlowStatus();
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);
  const goBack = () => {
    setErrorCode(null);
    if (sentToEmail) setSentToEmail(null);
    else router.back();
  };
  const renderLayout: AuthFormLayout = (fields, action) => (
    <AuthScreen
      title={sentToEmail ? t('emailOtpSentTitle') : t('emailLoginTitle')}
      subtitle={
        sentToEmail ? t('emailOtpSentBody', { email: sentToEmail }) : t('emailOtpFreshHint')
      }
      onBack={goBack}
      bottomAction={action}
    >
      <View className="gap-md" accessibilityLiveRegion="polite">
        {errorCode ? (
          <ShakeOnError errorCode={errorCode}>
            <AuthFormError code={errorCode} />
          </ShakeOnError>
        ) : null}
        {fields}
      </View>
    </AuthScreen>
  );
  return sentToEmail ? (
    <EmailOtpVerifyForm email={sentToEmail} renderLayout={renderLayout} />
  ) : (
    <EmailOtpRequestForm onSent={setSentToEmail} renderLayout={renderLayout} />
  );
}
