/**
 * The way to the app lock settings (RAPP-236), from the player profile and the
 * team screens. Hidden on the web, where the lock does not exist.
 */
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Text } from 'react-native';

export function AppLockLink({ variant }: { readonly variant: 'link' | 'button' }) {
  const { t } = useTranslation('auth');
  const { push } = useRouter();
  const languageFontClass = useLanguageFontClass();
  const { area } = useAccountAccess();
  // For team members and entity contacts the screen also holds their language
  // (RAPP-238), so it is their Settings.
  const label = area === 'team' || area === 'entity' ? t('teamSettingsTitle') : t('appLockTitle');
  if (Platform.OS === 'web') return null;

  if (variant === 'link') {
    return (
      <PressableScale
        testID="open-app-lock"
        accessibilityLabel={label}
        onPress={() => push('/app-lock' as Href)}
        haptic="selection"
        className="min-h-min justify-center px-sm"
      >
        <Text className={`text-sm font-semibold text-primary-dark ${languageFontClass}`}>
          {label}
        </Text>
      </PressableScale>
    );
  }
  return (
    <PressableScale
      testID="open-app-lock"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => push('/app-lock' as Href)}
      haptic="selection"
      style={continuousCorners}
      className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
    >
      <Text className={`text-center text-md font-bold text-primary ${languageFontClass}`}>
        {label}
      </Text>
    </PressableScale>
  );
}
