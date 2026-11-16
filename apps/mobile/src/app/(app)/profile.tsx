/**
 * El meu perfil (RAPP-22, RAPP-794): opened from her photo at the top of every
 * tab, as a short menu of six rows. Each row opens one screen, except the last,
 * which signs her out.
 *
 * It stays the RGPD self-service surface. She sees and corrects her data under
 * "Les meves dades", and gives or withdraws her consents and asks for erasure
 * under "Privacitat i permisos". The wizard's terms step promised she could
 * change the media consent "whenever you want, from your profile"; that
 * promise lands there.
 *
 * The route is `/profile`, as it was when the profile was a tab, so the links
 * that already point here keep working.
 */

import { NavRow } from '@/components/layout/nav-row';
import { ProfileScreenFrame } from '@/components/profile/profile-screen-frame';
import { logout } from '@/lib/auth';
import { playerNavIcons } from '@/lib/player-nav-icons';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text } from 'react-native';

// The dev-menu entry, required inside a __DEV__ branch so neither the component
// nor its label reaches a production bundle (RAPP-19).
const DevMenuEntry = __DEV__
  ? (require('@/components/dev/dev-menu-entry') as typeof import('@/components/dev/dev-menu-entry'))
      .DevMenuEntry
  : null;

export default function ProfileScreen() {
  const { t } = useTranslation(['profile', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const openData = useCallback(() => push('/profile-data' as Href), [push]);
  const openAttendance = useCallback(() => push('/profile-attendance' as Href), [push]);
  const openLanguage = useCallback(() => push('/profile-language' as Href), [push]);
  const openAppLock = useCallback(() => push('/app-lock' as Href), [push]);
  const openPrivacy = useCallback(() => push('/profile-privacy' as Href), [push]);
  const signOut = useCallback(() => void logout(), []);

  return (
    <ProfileScreenFrame title={t('title')} testID="profile-menu">
      <NavRow
        testID="profile-open-data"
        icon={playerNavIcons.myData}
        label={t('menu.data')}
        onPress={openData}
      />
      <NavRow
        testID="profile-open-attendance"
        icon={playerNavIcons.attendance}
        label={t('menu.attendance')}
        onPress={openAttendance}
      />
      <NavRow
        testID="profile-open-language"
        icon={playerNavIcons.language}
        label={t('menu.language')}
        onPress={openLanguage}
      />
      {/* The lock does not exist on the web. */}
      {Platform.OS === 'web' ? null : (
        <NavRow
          testID="open-app-lock"
          icon={playerNavIcons.appLock}
          label={t('menu.appLock')}
          onPress={openAppLock}
        />
      )}
      <NavRow
        testID="profile-open-privacy"
        icon={playerNavIcons.privacy}
        label={t('menu.privacy')}
        onPress={openPrivacy}
      />
      <NavRow
        testID="profile-sign-out"
        icon={playerNavIcons.signOut}
        label={t('signOutAction')}
        tone="danger"
        onPress={signOut}
      />
      <Text
        testID="generalitat-credit"
        className={`text-start text-xs leading-body text-neutral-600 ${languageFontClass}`}
      >
        {t('common:fundingAcknowledgment')}
      </Text>
      {DevMenuEntry === null ? null : <DevMenuEntry />}
    </ProfileScreenFrame>
  );
}
