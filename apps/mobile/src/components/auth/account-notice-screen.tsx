/**
 * A calm full-screen notice for a signed-in person the app has nothing for yet
 * (RAPP-232): an entity contact, a team member without an app screen, or an
 * account that could not be checked. Always offers sign-out, so nobody is
 * stuck on a shared phone.
 */
import { AppLockLink } from '@/components/auth/app-lock-link';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PageWidth } from '@/components/layout/content-width';
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
  showAppLock = false,
}: {
  readonly testID: string;
  readonly title: string;
  readonly body: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
  /** For a signed-in team member or entity contact, whose only screen this is. */
  readonly showAppLock?: boolean;
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
            <AuthSubmitButton
              testID={`${testID}-action`}
              label={action.label}
              onPress={action.onPress}
            />
          )}
          {showAppLock ? <AppLockLink variant="button" /> : null}
          <RaisedActionButton
            testID={`${testID}-sign-out`}
            label={t('signOutAction')}
            onPress={() => void logout()}
          />
        </View>
      </PageWidth>
    </SafeAreaView>
  );
}
