import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { useTranslation } from 'react-i18next';

// Placeholder shell for the services directory tab (RAPP-16); the feature lands later.
export default function ServicesScreen() {
  const { t } = useTranslation('nav');
  return <ScreenPlaceholder title={t('nav:tabs.services')} />;
}
