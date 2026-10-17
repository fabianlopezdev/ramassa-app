/**
 * The second factor in the app (RAPP-233), for a team member, and for a partner
 * entity's contact (RAPP-410): their screens open only once the session is
 * verified with an authenticator app. The phone
 * that shows this is usually the phone with the authenticator, so setting one
 * up offers the `otpauth://` link to open directly, and the secret as text.
 */
import { AuthFormError } from '@/components/auth/auth-form-error';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { safeAsync } from '@/lib/observability';
import { useGuardedLogout } from '@/lib/sign-out-guard';
import { supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  startSecondFactor,
  verifySecondFactor,
  type SecondFactorStart,
} from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';

export function SecondFactorScreen() {
  const signOut = useGuardedLogout();
  const { t } = useTranslation('auth');
  const { t: tProfile } = useTranslation('profile');
  const languageFontClass = useLanguageFontClass();
  const [start, setStart] = useState<SecondFactorStart | null>(null);
  const [code, setCode] = useState('');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void safeAsync(() => startSecondFactor(supabase)).then((result) => {
      if (!isCurrent) return;
      if (result.ok) setStart(result.value);
      else setErrorCode(result.error.code);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  async function submit() {
    if (start === null) return;
    setErrorCode(null);
    setIsVerifying(true);
    const result = await safeAsync(() => verifySecondFactor(supabase, start.factorId, code));
    setIsVerifying(false);
    // On success the session becomes aal2 and the layout opens the team screens.
    if (!result.ok) setErrorCode(result.error.code);
  }

  const enrolling = start?.kind === 'enroll';

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" testID="second-factor">
      <ScrollView keyboardShouldPersistTaps="handled">
        <PageWidth>
          <View className="gap-lg px-lg py-xl">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {enrolling ? t('secondFactorEnrollTitle') : t('secondFactorTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
              {enrolling ? t('secondFactorEnrollIntro') : t('secondFactorIntro')}
            </Text>
            {start === null && errorCode === null ? (
              <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
            ) : null}
            {start?.kind === 'enroll' ? (
              <View className="gap-sm">
                <PressableScale
                  testID="second-factor-open-authenticator"
                  accessibilityRole="button"
                  accessibilityLabel={t('secondFactorOpenAuthenticator')}
                  onPress={() => void Linking.openURL(start.uri)}
                  haptic="selection"
                  className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
                >
                  <Text className={`text-md font-semibold text-primary-dark ${languageFontClass}`}>
                    {t('secondFactorOpenAuthenticator')}
                  </Text>
                </PressableScale>
                <Text className={`text-start text-sm text-neutral-700 ${languageFontClass}`}>
                  {t('secondFactorSecretLabel')}
                </Text>
                <Text
                  selectable
                  testID="second-factor-secret"
                  className="rounded-md bg-neutral-100 px-md py-sm text-start font-mono text-md text-neutral-900"
                >
                  {start.secret}
                </Text>
              </View>
            ) : null}
            <AuthFormError code={errorCode} />
            <AuthTextField
              testID="second-factor-code"
              label={t('secondFactorCodeLabel')}
              value={code}
              onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              editable={start !== null}
            />
            <AuthSubmitButton
              testID="second-factor-verify"
              label={t('secondFactorVerifyAction')}
              onPress={() => void submit()}
              isLoading={isVerifying}
              disabled={start === null || code.length !== 6}
            />
            <PressableScale
              testID="second-factor-sign-out"
              accessibilityRole="button"
              accessibilityLabel={tProfile('signOutAction')}
              onPress={signOut}
              haptic="tapLight"
              className="min-h-recommended items-center justify-center px-lg"
            >
              <Text className={`text-md font-semibold text-primary-dark ${languageFontClass}`}>
                {tProfile('signOutAction')}
              </Text>
            </PressableScale>
          </View>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
