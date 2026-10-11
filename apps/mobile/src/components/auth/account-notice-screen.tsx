/**
 * A calm full-screen notice for a signed-in person the app has nothing for yet
 * (RAPP-232): an entity contact, a team member without an app screen, or an
 * account that could not be checked. Always offers sign-out, so nobody is
 * stuck on a shared phone.
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { logout } from '@/lib/auth';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function AccountNoticeScreen({
  testID,
  title,
  body,
  action,
}: {
  readonly testID: string;
  readonly title: string;
  readonly body: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}) {
  const { t } = useTranslation('profile');
  const languageFontClass = useLanguageFontClass();

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" testID={testID}>
      <PageWidth>
        <View className="flex-1 justify-center gap-lg px-lg">
          <Text
            accessibilityRole="header"
            className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {title}
          </Text>
          <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>{body}</Text>
          {action === undefined ? null : (
            <PressableScale
              testID={`${testID}-action`}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              haptic="selection"
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-md font-semibold text-white ${languageFontClass}`}>
                {action.label}
              </Text>
            </PressableScale>
          )}
          <PressableScale
            testID={`${testID}-sign-out`}
            accessibilityRole="button"
            accessibilityLabel={t('signOutAction')}
            onPress={() => void logout()}
            haptic="tapLight"
            className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg"
          >
            <Text className={`text-md font-semibold text-primary-dark ${languageFontClass}`}>
              {t('signOutAction')}
            </Text>
          </PressableScale>
        </View>
      </PageWidth>
    </SafeAreaView>
  );
}
