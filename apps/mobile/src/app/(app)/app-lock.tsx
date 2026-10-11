/**
 * App lock settings (RAPP-236): on or off, and how long the app may stay in the
 * background before it locks. Turning the lock on or off asks for Face ID, a
 * fingerprint or the passcode first, so somebody who picks up an open phone
 * cannot switch it off.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthBackButton } from '@/components/auth/auth-back-button';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { APP_LOCK_TIMEOUTS, type AppLockTimeout } from '@/lib/app-lock';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

const TIMEOUT_LABEL_KEYS: Record<AppLockTimeout, string> = {
  0: 'appLockImmediately',
  60: 'appLockAfterOneMinute',
  300: 'appLockAfterFiveMinutes',
  900: 'appLockAfterFifteenMinutes',
};

const switchTrackColor = { false: tokens.colors.neutral[300], true: tokens.colors.primary.DEFAULT };

export default function AppLockScreen() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const languageFontClass = useLanguageFontClass();
  const { isAvailable, settings, saveSettings, confirmOwner } = useAppLock();
  const [isConfirming, setIsConfirming] = useState(false);

  async function toggle(enabled: boolean) {
    if (settings === null) return;
    setIsConfirming(true);
    const isOwner = await confirmOwner();
    setIsConfirming(false);
    if (isOwner) saveSettings({ ...settings, enabled });
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" testID="app-lock-settings">
      <PageWidth>
        <ScrollView contentContainerClassName="gap-lg p-lg">
          <AuthBackButton onPress={() => router.back()} />
          <View className="gap-sm">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('appLockTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
              {t('appLockIntro')}
            </Text>
          </View>

          {isAvailable ? null : (
            <Text
              testID="app-lock-unavailable"
              className={`text-start text-md text-neutral-700 ${languageFontClass}`}
            >
              {t('appLockUnavailable')}
            </Text>
          )}

          <View className="min-h-recommended flex-row items-center justify-between gap-md rounded-md border border-neutral-200 bg-white px-md">
            <Text className={`flex-1 text-start text-md text-neutral-900 ${languageFontClass}`}>
              {t('appLockSwitchLabel')}
            </Text>
            <Switch
              testID="app-lock-switch"
              accessibilityLabel={t('appLockSwitchLabel')}
              value={settings?.enabled === true}
              disabled={!isAvailable || settings === null || isConfirming}
              onValueChange={(enabled) => void toggle(enabled)}
              trackColor={switchTrackColor}
            />
          </View>

          {settings?.enabled === true && isAvailable ? (
            <View className="gap-sm" accessibilityRole="radiogroup">
              <Text
                accessibilityRole="header"
                className={`text-start text-lg font-semibold text-neutral-900 ${languageFontClass}`}
              >
                {t('appLockAfterLabel')}
              </Text>
              {APP_LOCK_TIMEOUTS.map((timeout) => {
                const isSelected = settings.timeoutSeconds === timeout;
                const label = t(TIMEOUT_LABEL_KEYS[timeout]);
                return (
                  <PressableScale
                    key={timeout}
                    testID={`app-lock-timeout-${timeout}`}
                    accessibilityRole="radio"
                    accessibilityLabel={label}
                    isSelected={isSelected}
                    onPress={() => saveSettings({ ...settings, timeoutSeconds: timeout })}
                    haptic="selection"
                    className={`min-h-recommended justify-center rounded-md border px-md ${
                      isSelected ? 'border-primary bg-white' : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <Text
                      className={`text-start text-md ${
                        isSelected ? 'font-bold text-primary-dark' : 'text-neutral-900'
                      } ${languageFontClass}`}
                    >
                      {label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}
