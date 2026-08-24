import { AuthFormError } from '@/components/auth/auth-form-error';
import { EmailOtpRequestForm, EmailOtpVerifyForm } from '@/components/auth/email-otp-form';
import { PasswordLoginForm } from '@/components/auth/password-login-form';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type LoginMode = 'otp' | 'password';

// Required inside a __DEV__ branch so nothing dev-only reaches a production
// bundle (RAPP-19). It sits on the login screen too, not only on Profile: the
// account switcher is most useful exactly when nobody is signed in.
const DevMenuEntry = __DEV__
  ? (require('@/components/dev/dev-menu-entry') as typeof import('@/components/dev/dev-menu-entry'))
      .DevMenuEntry
  : null;

/** A quiet, link-styled action with a 48dp minimum target (mode switch, back). */
function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={onPress}
      haptic="selection"
      className="min-h-min items-center justify-center py-sm"
    >
      <Text className={`text-start text-md font-medium text-primary ${languageFontClass}`}>
        {label}
      </Text>
    </PressableScale>
  );
}

function EmailOtpEntry({ email, onBack }: { email: string; onBack: () => void }) {
  const { t } = useTranslation(['auth', 'common']);
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="gap-md" accessibilityLiveRegion="polite">
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
      >
        {t('auth:emailOtpSentTitle')}
      </Text>
      <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
        {t('auth:emailOtpSentBody', { email })}
      </Text>
      <EmailOtpVerifyForm email={email} />
      <AuthLink label={t('common:back')} onPress={onBack} />
    </View>
  );
}

export default function LoginScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { errorCode, setErrorCode } = useAuthFlowStatus();
  const [mode, setMode] = useState<LoginMode>('otp');
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);

  const switchTo = (nextMode: LoginMode) => {
    setErrorCode(null);
    setMode(nextMode);
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="grow justify-center p-lg"
          keyboardShouldPersistTaps="handled"
        >
          {/* The column stops growing on a wide browser instead of spanning the
              window (RAPP-80). Phone widths are below the breakpoint and unaffected. */}
          <FormWidth className="gap-xl">
            <View className="gap-xs">
              <Text
                accessibilityRole="header"
                className={`text-start text-3xl font-bold text-primary ${languageFontClass}`}
              >
                {t('common:appName')}
              </Text>
              <Text
                accessibilityRole="header"
                className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
              >
                {t('auth:loginTitle')}
              </Text>
              {mode === 'otp' && !sentToEmail ? (
                <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                  {t('auth:loginSubtitle')}
                </Text>
              ) : null}
            </View>

            <ShakeOnError errorCode={errorCode}>
              <AuthFormError code={errorCode} />
            </ShakeOnError>

            {sentToEmail ? (
              <EmailOtpEntry email={sentToEmail} onBack={() => setSentToEmail(null)} />
            ) : mode === 'otp' ? (
              <View className="gap-md">
                <EmailOtpRequestForm onSent={setSentToEmail} />
                {/* Reassurance for players who worry they have no password (persona). */}
                <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
                  {t('auth:emailOtpHint')}
                </Text>
                <AuthLink
                  label={t('auth:usePasswordInstead')}
                  onPress={() => switchTo('password')}
                />
              </View>
            ) : (
              <View className="gap-lg">
                <PasswordLoginForm />
                <AuthLink label={t('auth:useEmailOtpInstead')} onPress={() => switchTo('otp')} />
              </View>
            )}

            {DevMenuEntry === null ? null : (
              <View className="items-center">
                <DevMenuEntry />
              </View>
            )}
          </FormWidth>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
