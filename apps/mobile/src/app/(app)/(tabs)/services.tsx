import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { PlayerBaseDocumentList } from '@/components/knowledge/player-base-document-list';
import { PlayerGuideList } from '@/components/knowledge/player-guide-list';
import { PageWidth } from '@/components/layout/content-width';
import { ScreenSection } from '@/components/layout/screen-section';
import { screenBlockGapClassName } from '@/components/layout/screen-spacing';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/components/layout/segmented-control';
import { withScreenEntrance } from '@/components/motion/screen-entrance';
import { PlayerTabHeader } from '@/components/profile/player-tab-header';
import { ServiceCategoryGrid } from '@/components/services/service-category-grid';
import { useAjudaRefresh } from '@/lib/ajuda-refresh';
import { countUnseenHelpItems, NO_HELP_NUMBERS } from '@/lib/help-news';
import { selectBaseDocuments } from '@/lib/player-guides';
import { usePlayerKnowledgeArticles } from '@/lib/player-knowledge';
import { usePlayerServiceCategories } from '@/lib/player-services';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { usePlayerTabContentInsets } from '@/lib/use-player-tab-content-insets';
import { useTabNews } from '@/lib/use-tab-news';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing['3xl'],
  },
});
/**
 * The views of Ajuda: the club's base documents (RAPP-972), services by
 * category, and the guides (RAPP-851). Documents comes first, and only once
 * the club has published one.
 */
type AjudaSegment = 'documents' | 'services' | 'guides';

function ServicesScreen() {
  const { t } = useTranslation(['playerServices', 'errors', 'nav', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const categoriesQuery = usePlayerServiceCategories();
  const { refresh, isRefreshing } = useAjudaRefresh();
  // Ajuda opens on the club's documents; with none published yet, on Serveis.
  const [chosenSegment, setSegment] = useState<AjudaSegment>('documents');
  const hasBaseDocuments = selectBaseDocuments(usePlayerKnowledgeArticles().data).length > 0;
  const segment = chosenSegment === 'documents' && !hasBaseDocuments ? 'services' : chosenSegment;
  // The numbers count what she has not seen in a category's list; the "Nou"
  // stays until she opens that service or guide (RAPP-873).
  const { data: news } = useTabNews();
  const serviceNews = useMemo(
    () =>
      news === undefined ? NO_HELP_NUMBERS : countUnseenHelpItems(news.services.unseenServices),
    [news],
  );
  const guideNewsCount = news?.guides.unseenArticles.length ?? 0;
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
      ...(hasBaseDocuments
        ? [
            {
              key: 'documents' as const,
              label: t('playerServices:segmentDocuments'),
              symbol: 'document' as const,
              testID: 'ajuda-segment-documents',
            },
          ]
        : []),
      {
        key: 'services',
        label: t('playerServices:segmentServices'),
        symbol: 'grid',
        testID: 'ajuda-segment-services',
        count: serviceNews.total,
        accessibilityLabel:
          serviceNews.total > 0
            ? t('common:newCount', {
                label: t('playerServices:segmentServices'),
                count: serviceNews.total,
              })
            : undefined,
      },
      {
        key: 'guides',
        label: t('playerServices:segmentGuides'),
        symbol: 'book',
        testID: 'ajuda-segment-guides',
        count: guideNewsCount,
        accessibilityLabel:
          guideNewsCount > 0
            ? t('common:newCount', {
                label: t('playerServices:segmentGuides'),
                count: guideNewsCount,
              })
            : undefined,
      },
    ],
    [guideNewsCount, hasBaseDocuments, serviceNews.total, t],
  );

  // One header for every view, so the switch stays in place while any loads.
  // The shared header draws Inici's section divider under the switch (RAPP-854).
  const tabHeader = (
    <PlayerTabHeader title={t('nav:tabs.services')}>
      <SegmentedControl
        testID="ajuda-segments"
        options={segmentOptions}
        selected={segment}
        onSelect={setSegment}
        accessibilityLabel={t('playerServices:segmentsLabel')}
        languageFontClass={languageFontClass}
      />
    </PlayerTabHeader>
  );

  // What sits under the header, and the name the page takes for the tests.
  let body: ReactElement;
  let screenTestID: string | undefined;
  if (segment === 'documents') {
    body = <PlayerBaseDocumentList />;
    screenTestID = 'ajuda-base-documents';
  } else if (segment === 'guides') {
    body = <PlayerGuideList />;
    screenTestID = 'knowledge-base-screen';
  } else if (categoriesQuery.isPending && categoriesQuery.data === undefined) {
    body = <AnnouncementFeedSkeleton accessibilityLabel={t('playerServices:loading')} />;
  } else if (categoriesQuery.isError && categoriesQuery.data === undefined) {
    body = (
      <AnnouncementFeedError
        message={t('playerServices:loadFailed')}
        retryLabel={t('playerServices:retry')}
        code={toAppError(categoriesQuery.error).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
      />
    );
  } else {
    body = (
      <PageWidth>
        <ScreenSection title={t('playerServices:chooseCategory')} isLast>
          <ServiceCategoryGrid
            categories={categoriesQuery.data ?? []}
            newCounts={serviceNews.countsByCategoryId}
            onSelect={selectCategory}
          />
        </ScreenSection>
      </PageWidth>
    );
    screenTestID = 'player-services-categories';
  }

  // One scrolling page for the three views (RAPP-977). The header is the same
  // piece of the page whichever view shows, so choosing another view only
  // changes what is under it. Her photo, the title and the switch are never
  // built again, which is what made the photo blink on Android.
  return (
    <ScrollView
      testID={screenTestID}
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
    >
      <View className={screenBlockGapClassName}>
        <PageWidth>{tabHeader}</PageWidth>
        {body}
      </View>
    </ScrollView>
  );
}

export default withScreenEntrance('services', ServicesScreen);
