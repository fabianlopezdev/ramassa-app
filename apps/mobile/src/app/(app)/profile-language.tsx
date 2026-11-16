/**
 * Idioma (RAPP-794): the language of the app, opened from the profile menu.
 */
import { LanguageSwitcher } from '@/components/profile/language-switcher';
import { ProfileScreenFrame } from '@/components/profile/profile-screen-frame';
import { useTranslation } from 'react-i18next';

export default function ProfileLanguageScreen() {
  const { t } = useTranslation('profile');
  return (
    <ProfileScreenFrame title={t('menu.language')} testID="profile-language">
      <LanguageSwitcher />
    </ProfileScreenFrame>
  );
}
