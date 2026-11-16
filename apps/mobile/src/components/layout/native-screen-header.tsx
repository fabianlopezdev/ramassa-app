/**
 * The one back control of a pushed screen (RAPP-806): the native header, with
 * the screen's title where it has one. Its back arrow mirrors by itself in
 * Arabic and Farsi, and on the web the same header draws a back button while
 * there is a screen to go back to. Render it in every state of the screen
 * (loading, error and loaded), so the header never comes and goes.
 */
import { Stack } from 'expo-router/stack';
import { useMemo } from 'react';

export function NativeScreenHeader({ title = '' }: { readonly title?: string }) {
  const options = useMemo(
    () => ({
      headerShown: true,
      headerBackButtonDisplayMode: 'minimal' as const,
      title,
    }),
    [title],
  );
  return <Stack.Screen options={options} />;
}
