/**
 * The call to action of a screen, at the bottom of the screen under its
 * scrolling content (RAPP-881), where the onboarding forms and the player tabs
 * keep theirs. It runs the width of the page and sits above the home indicator.
 *
 * The screen wraps its scroll view and this in one filling view, so the content
 * scrolls above the action and never under it.
 */
import { PageWidth } from '@/components/layout/content-width';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BOTTOM_EDGE = ['bottom'] as const;

export function ScreenAction({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  return (
    <SafeAreaView edges={BOTTOM_EDGE}>
      <View testID={testID} className="px-lg pb-md pt-sm">
        <PageWidth>{children}</PageWidth>
      </View>
    </SafeAreaView>
  );
}
