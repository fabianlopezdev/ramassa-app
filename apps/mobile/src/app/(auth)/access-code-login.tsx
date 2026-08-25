import { AccessCodeLoginForm } from '@/components/auth/access-code-login-form';
import { AuthFormError } from '@/components/auth/auth-form-error';
import { AuthScreen } from '@/components/auth/auth-screen';
import { SupportEmailLink } from '@/components/auth/support-email-link';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function AccessCodeLoginScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const { errorCode } = useAuthFlowStatus();

  return (
    <AuthScreen title={t('accessCodeTitle')} subtitle={t('accessCodeIntro')} onBack={router.back}>
      <ShakeOnError errorCode={errorCode}>
        <AuthFormError code={errorCode} />
      </ShakeOnError>
      <AccessCodeLoginForm />
      <SupportEmailLink translationKey="accessCodeSupportPrompt" />
    </AuthScreen>
  );
}
