import { PressableScale } from '@/components/motion/pressable-scale';
import { logout } from '@/lib/auth';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

/**
 * Signing out clears the session; the auth-state change flips the root
 * navigator's guard and returns to `(auth)` with no manual navigation (RAPP-13).
 */
function SignOutButton() {
  const { t } = useTranslation('auth');
  const languageFontClass = useLanguageFontClass();
  return (
    <PressableScale
      accessibilityLabel={t('signOutAction')}
      onPress={() => void logout()}
      haptic="tapLight"
      style={continuousCorners}
      className="mt-xl min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
    >
      <Text className={`text-md font-medium text-neutral-800 ${languageFontClass}`}>
        {t('signOutAction')}
      </Text>
    </PressableScale>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation(['home', 'common']);
  const languageFontClass = useLanguageFontClass();

  return (
    <View className="flex-1 items-center justify-center bg-white">
      {/* Radius and color come from shared tokens (ADR-015): bg-primary and
          rounded-lg resolve to packages/shared/tokens via the NativeWind config. */}
      <View className="rounded-lg bg-primary px-lg py-md" style={continuousCorners}>
        <Text className="text-2xl font-bold text-white">{t('common:appName')}</Text>
      </View>
      <Text className={`mt-2 text-xl text-neutral-900 ${languageFontClass}`}>
        {t('home:title')}
      </Text>
      <Text className={`mt-2 text-base text-neutral-500 ${languageFontClass}`}>
        {t('home:subtitle')}
      </Text>
      <SignOutButton />
      {/* The RAPP-12 forced-error buttons that used to sit here moved into the
          dev menu's Errors section (RAPP-19), which their own comment said was
          where they belonged once it existed. */}
    </View>
  );
}
