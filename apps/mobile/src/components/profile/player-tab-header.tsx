/**
 * The header of every player tab (RAPP-813): the tab's name and her photo in
 * one row. The title takes the tab's own label, so the tab bar and the page
 * always read the same. The row follows the reading direction: the title at
 * the start and the photo at the end, mirrored in Arabic and Farsi.
 *
 * `PlayerTabStateFrame` keeps the same header above a tab's loading and error
 * states, so her photo never disappears while a tab waits for its data.
 */
import { PageWidth } from '@/components/layout/content-width';
import { ProfilePhotoButton } from '@/components/profile/profile-photo-button';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PlayerTabHeader({ title }: { readonly title: string }) {
  const languageFontClass = useLanguageFontClass();
  return (
    <View testID="player-tab-header" className="flex-row items-center gap-md">
      <Text
        accessibilityRole="header"
        className={`flex-1 text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
      >
        {title}
      </Text>
      <ProfilePhotoButton />
    </View>
  );
}

/** A tab's loading or error state under the same header as its content. */
export function PlayerTabStateFrame({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const topInset = useMemo(() => ({ paddingTop: insets.top }), [insets.top]);
  return (
    <View className="flex-1 bg-white" style={topInset}>
      <View className="px-lg pt-lg">
        <PageWidth>
          <PlayerTabHeader title={title} />
        </PageWidth>
      </View>
      {children}
    </View>
  );
}
