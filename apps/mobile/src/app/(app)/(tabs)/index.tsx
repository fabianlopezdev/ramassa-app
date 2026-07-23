import { logout } from '@/lib/auth';
import { safeAsync } from '@/lib/observability';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { AppError } from '@ramassa/shared/errors';

/**
 * Signing out clears the session; the auth-state change flips the root
 * navigator's guard and returns to `(auth)` with no manual navigation (RAPP-13).
 */
function SignOutButton() {
  const { t } = useTranslation('auth');
  const languageFontClass = useLanguageFontClass();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('signOutAction')}
      onPress={() => void logout()}
      className="mt-xl min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg active:opacity-80"
    >
      <Text className={`text-md font-medium text-neutral-800 ${languageFontClass}`}>
        {t('signOutAction')}
      </Text>
    </Pressable>
  );
}

/**
 * RAPP-12 acceptance drivers, dev builds only (the real dev menu is RAPP-19):
 * one button throws during render to exercise the ErrorBoundary chain, the
 * other fails inside safeAsync to exercise logger -> Sentry. Dev-only strings
 * are exempt from the no-literal-string rule: users never see them.
 */
function DevForcedErrorTriggers() {
  const [shouldThrowInRender, setShouldThrowInRender] = useState(false);

  if (shouldThrowInRender) {
    throw new AppError('UNEXPECTED-1', { message: 'forced render error (RAPP-12 dev trigger)' });
  }

  return (
    <View className="mt-xl items-center gap-sm">
      <Pressable
        accessibilityRole="button"
        className="rounded-md bg-error px-lg py-sm"
        onPress={() => setShouldThrowInRender(true)}
      >
        {/* eslint-disable-next-line i18next/no-literal-string -- dev-only trigger */}
        <Text className="font-bold text-white">DEV: crash render</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        className="rounded-md bg-warning px-lg py-sm"
        onPress={() => {
          void safeAsync(
            () => Promise.reject(new Error('forced async failure (RAPP-12 dev trigger)')),
            { code: 'NETWORK-1', context: { trigger: 'dev-button' } },
          );
        }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string -- dev-only trigger */}
        <Text className="font-bold text-neutral-900">DEV: fail safeAsync</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation(['home', 'common']);
  const languageFontClass = useLanguageFontClass();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      {/* Radius and color come from shared tokens (ADR-015): bg-primary and
          rounded-lg resolve to packages/shared/tokens via the NativeWind config. */}
      <View className="rounded-lg bg-primary px-lg py-md">
        <Text className="text-2xl font-bold text-white">{t('common:appName')}</Text>
      </View>
      <Text className={`mt-2 text-xl text-neutral-900 ${languageFontClass}`}>
        {t('home:title')}
      </Text>
      <Text className={`mt-2 text-base text-neutral-500 ${languageFontClass}`}>
        {t('home:subtitle')}
      </Text>
      <SignOutButton />
      {__DEV__ ? <DevForcedErrorTriggers /> : null}
    </View>
  );
}
