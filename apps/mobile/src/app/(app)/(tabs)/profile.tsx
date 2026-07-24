import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

// The dev-menu entry, required inside a __DEV__ branch so neither the component
// nor its label reaches a production bundle (RAPP-19). Settings will live on
// this tab (RAPP-22), which is where the SPEC says the menu belongs.
const DevMenuEntry = __DEV__
  ? (require('@/components/dev/dev-menu-entry') as typeof import('@/components/dev/dev-menu-entry'))
      .DevMenuEntry
  : null;

// Placeholder shell for the profile tab (RAPP-16); the feature lands later.
export default function ProfileScreen() {
  const { t } = useTranslation('nav');
  return (
    <View className="flex-1 bg-white">
      <ScreenPlaceholder title={t('nav:tabs.profile')} />
      {DevMenuEntry === null ? null : (
        <View className="items-center px-lg pb-xl">
          <DevMenuEntry />
        </View>
      )}
    </View>
  );
}
