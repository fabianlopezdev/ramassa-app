import { AuthFormError } from '@/components/auth/auth-form-error';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { PasswordLoginForm } from '@/components/auth/password-login-form';
import { useAuthFlowStatus } from '@/lib/auth-flow-status';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type LoginMode = 'magic' | 'password';

/** A quiet, link-styled action with a 48dp minimum target (mode switch, back). */
function AuthLink({ label, onPress }: { label: string; onPress: () => void }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-min items-center justify-center py-sm active:opacity-70"
    >
      <Text className={`text-start text-md font-medium text-primary ${languageFontClass}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The confirmation shown after a magic link is sent (first WCAG AA screen). */
function MagicLinkSent({ email, onBack }: { email: string; onBack: () => void }) {
  const { t } = useTranslation(['auth', 'common']);
  const languageFontClass = useLanguageFontClass();
  return (
    <View className="gap-md" accessibilityLiveRegion="polite">
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
      >
        {t('auth:magicLinkSentTitle')}
      </Text>
      <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
        {t('auth:magicLinkSentBody', { email })}
      </Text>
      <AuthLink label={t('common:back')} onPress={onBack} />
    </View>
  );
}

export default function LoginScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { errorCode, setErrorCode } = useAuthFlowStatus();
  const [mode, setMode] = useState<LoginMode>('magic');
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);

  const switchTo = (nextMode: LoginMode) => {
    setErrorCode(null);
    setMode(nextMode);
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="grow justify-center gap-xl p-lg"
          keyboardShouldPersistTaps="handled"
        >
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
            {mode === 'magic' && !sentToEmail ? (
              <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
                {t('auth:loginSubtitle')}
              </Text>
            ) : null}
          </View>

          <AuthFormError code={errorCode} />

          {sentToEmail ? (
            <MagicLinkSent email={sentToEmail} onBack={() => setSentToEmail(null)} />
          ) : mode === 'magic' ? (
            <View className="gap-md">
              <MagicLinkForm onSent={setSentToEmail} />
              {/* Reassurance for players who worry they have no password (persona). */}
              <Text className={`text-start text-sm text-neutral-500 ${languageFontClass}`}>
                {t('auth:magicLinkHint')}
              </Text>
              <AuthLink label={t('auth:usePasswordInstead')} onPress={() => switchTo('password')} />
            </View>
          ) : (
            <View className="gap-lg">
              <PasswordLoginForm />
              <AuthLink label={t('auth:useMagicLinkInstead')} onPress={() => switchTo('magic')} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
