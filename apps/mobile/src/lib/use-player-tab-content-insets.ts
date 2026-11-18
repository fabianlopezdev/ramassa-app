import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

/**
 * The space between the status bar and the header of a player tab (RAPP-818).
 * Kept small so the title and her photo sit at the top of the screen and the
 * content below gets the room.
 */
export const PLAYER_TAB_TOP_GAP = tokens.spacing.xs;

/**
 * The top and bottom padding of a player tab's scrolling content, the same on
 * all five tabs (RAPP-818). On iOS the automatic inset adjustment already
 * clears the status bar and the floating tab bar, so only the gap is added.
 * Android draws edge to edge, so the insets are added by hand.
 */
export function usePlayerTabContentInsets() {
  const insets = useSafeAreaInsets();
  return useMemo(
    () =>
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + PLAYER_TAB_TOP_GAP,
            paddingBottom: insets.bottom + tokens.spacing['3xl'],
          }
        : { paddingTop: PLAYER_TAB_TOP_GAP },
    [insets.bottom, insets.top],
  );
}
