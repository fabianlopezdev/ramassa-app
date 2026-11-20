import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { PlayerGuideList } from '@/components/knowledge/player-guide-list';
import { PageWidth } from '@/components/layout/content-width';
import { Divider } from '@/components/layout/divider';
import { ScreenSection } from '@/components/layout/screen-section';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/components/layout/segmented-control';
import { PlayerTabHeader } from '@/components/profile/player-tab-header';
import { ServiceCategoryGrid } from '@/components/services/service-category-grid';
import { usePlayerServiceCategories } from '@/lib/player-services';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { usePlayerTabContentInsets } from '@/lib/use-player-tab-content-insets';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing['3xl'],
  },
});
/** The two views of Ajuda (RAPP-851): services by category, and the guides. */
type AjudaSegment = 'services' | 'guides';

export default function ServicesScreen() {
  const { t } = useTranslation(['playerServices', 'errors', 'nav']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const categoriesQuery = usePlayerServiceCategories();
  const [segment, setSegment] = useState<AjudaSegment>('services');
  const tabInsets = usePlayerTabContentInsets();
  const contentContainerStyle = useMemo(() => [styles.listContent, tabInsets], [tabInsets]);
  const selectCategory = useCallback(
    (categoryId: string) =>
      push({
        pathname: '/service-category/[categoryId]',
        params: { categoryId },
      } as unknown as Href),
    [push],
  );
  const segmentOptions = useMemo<readonly SegmentedControlOption<AjudaSegment>[]>(
    () => [
      {
        key: 'services',
        label: t('playerServices:segmentServices'),
        symbol: 'grid',
        testID: 'ajuda-segment-services',
      },
      {
        key: 'guides',
        label: t('playerServices:segmentGuides'),
        symbol: 'book',
        testID: 'ajuda-segment-guides',
      },
    ],
    [t],
  );

  // One header for both segments, so the switch stays in place while either loads.
  // The line under the switch is Inici's section divider (RAPP-854).
  const tabHeader = (
    <View className="gap-lg">
      <View className="gap-md">
        <PlayerTabHeader title={t('nav:tabs.services')} />
        <SegmentedControl
          testID="ajuda-segments"
          options={segmentOptions}
          selected={segment}
          onSelect={setSegment}
          accessibilityLabel={t('playerServices:segmentsLabel')}
          languageFontClass={languageFontClass}
        />
      </View>
      <Divider />
    </View>
  );

  if (segment === 'guides') {
    return (
      <PlayerGuideList
        header={<PageWidth>{tabHeader}</PageWidth>}
        contentContainerStyle={contentContainerStyle}
      />
    );
  }

  const stateScreen = (body: ReactElement, testID?: string) => (
    <ScrollView
      testID={testID}
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View className="gap-lg">
        <PageWidth>{tabHeader}</PageWidth>
        {body}
      </View>
    </ScrollView>
  );

  if (categoriesQuery.isPending && categoriesQuery.data === undefined) {
    return stateScreen(
      <AnnouncementFeedSkeleton accessibilityLabel={t('playerServices:loading')} />,
    );
  }
  if (categoriesQuery.isError && categoriesQuery.data === undefined) {
    return stateScreen(
      <AnnouncementFeedError
        message={t('playerServices:loadFailed')}
        retryLabel={t('playerServices:retry')}
        code={toAppError(categoriesQuery.error).code}
        languageFontClass={languageFontClass}
        onRetry={() => void categoriesQuery.refetch()}
      />,
    );
  }

  return stateScreen(
    <PageWidth>
      <ScreenSection title={t('playerServices:chooseCategory')} isLast>
        <ServiceCategoryGrid categories={categoriesQuery.data ?? []} onSelect={selectCategory} />
      </ScreenSection>
    </PageWidth>,
    'player-services-categories',
  );
}
