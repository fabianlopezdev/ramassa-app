/**
 * The services of one Ajuda category (RAPP-870), opened from its tile in
 * Serveis. A pushed screen like the guides of a category and every other: the
 * native back arrow and the category's name in the header, on the wash of the
 * category's colour (RAPP-856), the shade of its icon circle. Her filters
 * (zone, cost, availability and the category's own fields) sit above the
 * list. Each service opens `service/[id]`.
 */
import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { AppSheet } from '@/components/layout/app-sheet';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { useSectionWash } from '@/components/layout/raised-surface';
import { ServiceCard } from '@/components/services/service-card';
import { ServiceFilterPanel } from '@/components/services/service-filter-panel';
import { isNetworkStateOnline } from '@/lib/network-status';
import {
  usePlayerServiceCategories,
  usePlayerServices,
  type PlayerServiceFilterSelection,
} from '@/lib/player-services';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useNetworkState } from 'expo-network';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { isCategoryColor } from '@ramassa/shared/category-colors';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import { type PlayerServiceRow } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_FILTERS: PlayerServiceFilterSelection = {};
const EMPTY_SERVICES: readonly PlayerServiceRow[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surface.page },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing['3xl'],
  },
});
const keyExtractor = (service: PlayerServiceRow) => service.id;

function hasFilters(filters: PlayerServiceFilterSelection): boolean {
  return (
    filters.zone !== undefined ||
    filters.costType !== undefined ||
    filters.availability !== undefined ||
    Object.keys(filters.metadata ?? {}).length > 0
  );
}

function activeFilterCount(filters: PlayerServiceFilterSelection): number {
  return (
    Number(filters.zone !== undefined) +
    Number(filters.costType !== undefined) +
    Number(filters.availability !== undefined) +
    Object.keys(filters.metadata ?? {}).length
  );
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function availabilityKey(value: PlayerServiceRow['availability']): string {
  if (value === 'waiting_list') return 'WaitingList';
  if (value === 'by_appointment') return 'ByAppointment';
  return capitalize(value);
}

export default function ServiceCategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { t, i18n } = useTranslation(['playerServices', 'errors']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const isOffline = !isNetworkStateOnline(useNetworkState());
  const categoriesQuery = usePlayerServiceCategories();
  const category = categoriesQuery.data?.find((candidate) => candidate.id === categoryId) ?? null;
  const [filters, setFilters] = useState<PlayerServiceFilterSelection>(EMPTY_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const baseServicesQuery = usePlayerServices(category, EMPTY_FILTERS);
  const servicesQuery = usePlayerServices(category, filters);
  const services = servicesQuery.data ?? EMPTY_SERVICES;
  const availableServices = baseServicesQuery.data ?? EMPTY_SERVICES;
  const selectedFilterCount = activeFilterCount(filters);
  const title =
    category === null ? '' : (resolveLocalizedText(category.name, language)?.text ?? '');
  // The screen reads its shade like every coloured screen (RAPP-893). Only
  // the eight hues wash it, the rule its tile follows, so a category left
  // on an older name stays on the page colour like its tile.
  const wash = useSectionWash(
    category === null || !isCategoryColor(category.color) ? undefined : category.color,
  );
  const screenStyle = useMemo(
    () => (wash === undefined ? styles.screen : { ...styles.screen, backgroundColor: wash }),
    [wash],
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? 'ca', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.resolvedLanguage],
  );
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);
  const openFilters = useCallback(() => setFiltersVisible(true), []);
  const closeFilters = useCallback(() => setFiltersVisible(false), []);
  const openService = useCallback(
    (id: string) => push({ pathname: '/service/[id]', params: { id } } as unknown as Href),
    [push],
  );
  const refresh = useCallback(() => {
    void Promise.all([
      categoriesQuery.refetch(),
      baseServicesQuery.refetch(),
      servicesQuery.refetch(),
    ]);
  }, [baseServicesQuery, categoriesQuery, servicesQuery]);
  const renderService = useCallback(
    ({ item }: ListRenderItemInfo<PlayerServiceRow>) => {
      const serviceTitle = resolveLocalizedText(item.title, language);
      if (serviceTitle === undefined) return null;
      const firstImage = item.images[0];
      const imageAlt =
        firstImage === undefined ? undefined : resolveLocalizedText(firstImage.alt_text, language);
      const cost =
        item.cost_amount === null
          ? t(`playerServices:cost${capitalize(item.cost_type)}`)
          : currencyFormatter.format(item.cost_amount);
      const availability = t(`playerServices:availability${availabilityKey(item.availability)}`);
      return (
        <PageWidth className="pb-md">
          <ServiceCard
            id={item.id}
            title={serviceTitle.text}
            provider={item.provider_name}
            location={item.location}
            cost={cost}
            availability={availability}
            interested={item.interested}
            interestedLabel={t('playerServices:interestSaved')}
            imageObjectKey={firstImage?.url ?? null}
            imageAlt={imageAlt?.text ?? null}
            accessibilityLabel={[
              t('playerServices:openService', { title: serviceTitle.text }),
              item.provider_name,
              item.location,
              cost,
              availability,
            ]
              .filter((value): value is string => typeof value === 'string')
              .join('. ')}
            languageFontClass={languageFontClass}
            onOpen={openService}
          />
        </PageWidth>
      );
    },
    [currencyFormatter, language, languageFontClass, openService, t],
  );

  const filterLabel =
    selectedFilterCount > 0
      ? t('playerServices:filterShowActive', { count: selectedFilterCount })
      : t('playerServices:filterShow');

  let emptyState: ReactElement;
  if (
    (categoriesQuery.isPending && categoriesQuery.data === undefined) ||
    (servicesQuery.isPending && servicesQuery.data === undefined)
  ) {
    emptyState = <AnnouncementFeedSkeleton accessibilityLabel={t('playerServices:loading')} />;
  } else if (
    (categoriesQuery.isError && categoriesQuery.data === undefined) ||
    (servicesQuery.isError && servicesQuery.data === undefined)
  ) {
    emptyState = (
      <AnnouncementFeedError
        message={t('playerServices:loadFailed')}
        retryLabel={t('playerServices:retry')}
        code={toAppError(categoriesQuery.error ?? servicesQuery.error).code}
        languageFontClass={languageFontClass}
        onRetry={refresh}
      />
    );
  } else {
    emptyState = (
      <PageWidth>
        <AnnouncementEmptyState
          title={
            hasFilters(filters)
              ? t('playerServices:emptyFilteredTitle')
              : t('playerServices:emptyCategoryTitle')
          }
          body={
            hasFilters(filters)
              ? t('playerServices:emptyFilteredBody')
              : t('playerServices:emptyCategoryBody')
          }
          languageFontClass={languageFontClass}
        />
      </PageWidth>
    );
  }

  return (
    <>
      <NativeScreenHeader title={title} backgroundColor={wash} />
      <FlashList
        testID="player-services-list"
        data={services}
        renderItem={renderService}
        keyExtractor={keyExtractor}
        style={screenStyle}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={servicesQuery.isRefetching && !isOffline}
        onRefresh={refresh}
        ListHeaderComponent={
          category === null ? null : (
            <PageWidth className="pb-lg">
              <RaisedActionButton
                testID="services-toggle-filters"
                label={filterLabel}
                onPress={openFilters}
              />
            </PageWidth>
          )
        }
        ListEmptyComponent={emptyState}
      />
      {/* The filters rise in the app's one sheet (RAPP-878), over the list they filter. */}
      {category === null ? null : (
        <AppSheet
          testID="services-filters-sheet"
          title={t('playerServices:filterHeading')}
          visible={filtersVisible}
          onClose={closeFilters}
        >
          <ServiceFilterPanel
            contract={category.contract}
            availableServices={availableServices}
            selection={filters}
            onChange={setFilters}
            onClear={clearFilters}
          />
        </AppSheet>
      )}
    </>
  );
}
