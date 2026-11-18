/**
 * The one back control of a pushed screen (RAPP-806): the native header, with
 * the screen's title where it has one. Its back arrow mirrors by itself in
 * Arabic and Farsi, and on the web the same header draws a back button while
 * there is a screen to go back to. Render it in every state of the screen
 * (loading, error and loaded), so the header never comes and goes.
 *
 * The header has no line under it and takes the colour of the screen below,
 * so the two read as one surface (RAPP-820). Most pushed screens sit on the
 * page colour; a screen on white passes `surface="white"`.
 */
import { Stack } from 'expo-router/stack';
import { useMemo } from 'react';
import { tokens } from '@ramassa/shared/tokens';

const headerStyles = {
  page: { backgroundColor: tokens.colors.neutral[50] },
  white: { backgroundColor: tokens.colors.white },
} as const;

export function NativeScreenHeader({
  title = '',
  surface = 'page',
}: {
  readonly title?: string;
  /** The background of the screen under the header. */
  readonly surface?: keyof typeof headerStyles;
}) {
  const options = useMemo(
    () => ({
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal' as const,
      headerShadowVisible: false,
      headerStyle: headerStyles[surface],
      title,
    }),
    [surface, title],
  );
  return <Stack.Screen options={options} />;
}
