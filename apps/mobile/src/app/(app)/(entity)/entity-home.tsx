/**
 * The partner entity's Home on the phone (RAPP-410): the first tab of her
 * shell. The impact on the women her entity referred comes in RAPP-411; the
 * screen already holds the account controls she needs on a shared phone, the
 * app lock and sign-out.
 */
import { AppLockLink } from '@/components/auth/app-lock-link';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { logout } from '@/lib/auth';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EntityHomeScreen() {
  const { t } = useTranslation('nav');
  const { t: tEntity } = useTranslation('entity-management');
  const { t: tProfile } = useTranslation('profile');
  const fontClass = useLanguageFontClass();

  return (
    <SafeAreaView
      testID="entity-home"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('entity.dashboard')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {tEntity('dashboardIntro')}
            </Text>
          </View>
          <View className="gap-sm">
            <AppLockLink variant="button" />
            <PressableScale
              testID="entity-sign-out"
              accessibilityRole="button"
              accessibilityLabel={tProfile('signOutAction')}
              onPress={() => void logout()}
              haptic="tapLight"
              className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
            >
              <Text className={`text-md font-semibold text-primary-dark ${fontClass}`}>
                {tProfile('signOutAction')}
              </Text>
            </PressableScale>
          </View>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
