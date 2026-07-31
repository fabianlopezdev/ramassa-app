import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

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
    // A ScrollView with automatic inset adjustment, not a plain View. The iOS 26
    // native tab bar is a floating pill drawn OVER the screen, so anything laid
    // out at the bottom of a tab screen sits underneath it: unreachable, and
    // absent from the accessibility tree entirely. The dev-menu entry was the
    // first casualty (a tap on it selected whichever tab was behind it), but the
    // same would happen to any real bottom-anchored content, which this tab gets
    // when settings land (RAPP-22). `automatic` lets iOS inset for the bar it
    // drew; Android's bar does not overlay, so nothing changes there.
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="grow"
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* The entry renders WITH the centred placeholder, not below it: content
          sized to the viewport puts anything after the placeholder underneath
          the floating tab bar - present in the hierarchy, invisible on screen.
          A dev-only affordance on a placeholder screen can simply live centre
          stage until RAPP-22 replaces this screen with real settings. */}
      <ScreenPlaceholder title={t('nav:tabs.profile')}>
        {DevMenuEntry === null ? null : <DevMenuEntry />}
      </ScreenPlaceholder>
    </ScrollView>
  );
}
