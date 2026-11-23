/**
 * Notificacions (RAPP-956): one switch for her notifications, opened from the
 * profile menu. Off stops them on every phone she uses. On asks the phone when
 * it was never asked. When the phone's settings block them, the screen says so
 * and opens those settings, the only place that can undo it.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { SwitchCard } from '@/components/forms/switch-card';
import { ProfileScreenFrame } from '@/components/profile/profile-screen-frame';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { usePushSettings } from '@/lib/use-push-settings';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text } from 'react-native';

export default function ProfileNotificationsScreen() {
  const { t } = useTranslation('profile');
  const languageFontClass = useLanguageFontClass();
  const { isReady, isOn, isBlockedByPhone, isLocked, failure, setEnabled } = usePushSettings();
  const openPhoneSettings = useCallback(() => void Linking.openSettings(), []);

  // The way to the phone's settings is the screen's call to action while the
  // phone blocks them, so it sits at the bottom like every other one (RAPP-881).
  const openSettingsAction = isBlockedByPhone ? (
    <AuthSubmitButton
      testID="notifications-open-settings"
      label={t('notificationsOpenSettings')}
      onPress={openPhoneSettings}
    />
  ) : undefined;

  return (
    <ProfileScreenFrame
      title={t('menu.notifications')}
      testID="profile-notifications"
      action={openSettingsAction}
    >
      <SwitchCard
        testID="notifications-switch"
        label={t('notificationsSwitch')}
        value={isOn}
        isDisabled={!isReady || isLocked || isBlockedByPhone}
        onValueChange={setEnabled}
      />
      {isBlockedByPhone ? (
        <Text
          testID="notifications-blocked"
          className={`text-start text-md text-neutral-700 ${languageFontClass}`}
        >
          {t('notificationsBlocked')}
        </Text>
      ) : null}
      {failure === null ? null : (
        <Text
          selectable
          accessibilityLiveRegion="polite"
          className={`text-start text-md text-error ${languageFontClass}`}
        >
          {failure === 'load' ? t('loadFailed') : t('saveFailed')}
        </Text>
      )}
    </ProfileScreenFrame>
  );
}
