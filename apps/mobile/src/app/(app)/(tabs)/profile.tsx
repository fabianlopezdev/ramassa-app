import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { useTranslation } from 'react-i18next';

// Placeholder shell for the profile tab (RAPP-16); the feature lands later.
export default function ProfileScreen() {
  const { t } = useTranslation('nav');
  return <ScreenPlaceholder title={t('nav:tabs.profile')} />;
}
