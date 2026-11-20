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
import { titleToContentGapClassName } from '@/components/layout/screen-spacing';
import { ProfilePhotoButton } from '@/components/profile/profile-photo-button';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { PLAYER_TAB_TOP_GAP } from '@/lib/use-player-tab-content-insets';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@ramassa/shared/tokens';

/** The page colour every tab shares (RAPP-847). */
const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: tokens.colors.surface.page },
});

/**
 * `children` is the tab's switch between its views (RAPP-889): it sits under the
 * title at the gap a section title keeps from its content.
 */
export function PlayerTabHeader({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}) {
  const languageFontClass = useLanguageFontClass();
  const titleRow = (
    <View testID="player-tab-header" className="flex-row items-center gap-md">
      <Text
        accessibilityRole="header"
        className={`flex-1 text-start text-4xl font-extrabold text-neutral-900 ${languageFontClass}`}
      >
        {title}
      </Text>
      <ProfilePhotoButton />
    </View>
  );
  if (children === undefined) return titleRow;
  return (
    <View className={titleToContentGapClassName}>
      {titleRow}
      {children}
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
  const topInset = useMemo(() => ({ paddingTop: insets.top + PLAYER_TAB_TOP_GAP }), [insets.top]);
  return (
    <View style={[styles.frame, topInset]}>
      <View className="px-lg">
        <PageWidth>
          <PlayerTabHeader title={title} />
        </PageWidth>
      </View>
      {children}
    </View>
  );
}
