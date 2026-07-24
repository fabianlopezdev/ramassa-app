import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { useTranslation } from 'react-i18next';

// Placeholder shell for the events/calendar tab (RAPP-16); the feature lands later.
export default function EventsScreen() {
  const { t } = useTranslation('nav');
  return <ScreenPlaceholder title={t('nav:tabs.events')} />;
}
