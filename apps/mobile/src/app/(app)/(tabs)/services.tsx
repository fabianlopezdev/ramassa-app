import {
  AnnouncementEmptyState,
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
  OfflineBanner,
} from '@/components/announcements/feed-states';
import { PageWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ServiceCard } from '@/components/services/service-card';
import { ServiceCategoryGrid } from '@/components/services/service-category-grid';
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
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import type { PlayerServiceRow } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';

const EMPTY_FILTERS: PlayerServiceFilterSelection = {};
const EMPTY_SERVICES: readonly PlayerServiceRow[] = [];
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.white },
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
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

export default function ServicesScreen() {
  const { t, i18n } = useTranslation(['playerServices', 'errors']);
  const { language } = useLanguage();
  const languageFontClass = useLanguageFontClass();
  const { push } = useRouter();
  const networkState = useNetworkState();
  const isOffline = !isNetworkStateOnline(networkState);
  const insets = useSafeAreaInsets();
  const categoriesQuery = usePlayerServiceCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [filters, setFilters] = useState<PlayerServiceFilterSelection>(EMPTY_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const category =
    categoriesQuery.data?.find((candidate) => candidate.id === selectedCategoryId) ?? null;
  const baseServicesQuery = usePlayerServices(category, EMPTY_FILTERS);
  const servicesQuery = usePlayerServices(category, filters);
  const services = servicesQuery.data ?? EMPTY_SERVICES;
  const availableServices = baseServicesQuery.data ?? EMPTY_SERVICES;
  const selectedFilterCount = activeFilterCount(filters);
  const selectedCategoryName =
    category === null ? undefined : resolveLocalizedText(category.name, language);
  const contentContainerStyle = useMemo(
    () => [
      styles.listContent,
      process.env.EXPO_OS === 'android'
        ? {
            paddingTop: insets.top + tokens.spacing.lg,
            paddingBottom: insets.bottom + tokens.spacing['3xl'],
          }
        : { paddingTop: tokens.spacing.lg },
    ],
    [insets.bottom, insets.top],
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage ?? 'ca', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.resolvedLanguage],
  );
  const selectCategory = useCallback((id: string) => {
    setSelectedCategoryId(id);
    setFilters(EMPTY_FILTERS);
    setFiltersVisible(false);
  }, []);
  const backToCategories = useCallback(() => {
    setSelectedCategoryId(null);
    setFilters(EMPTY_FILTERS);
    setFiltersVisible(false);
  }, []);
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);
  const toggleFilters = useCallback(() => setFiltersVisible((visible) => !visible), []);
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
    ({ item, index }: ListRenderItemInfo<PlayerServiceRow>) => {
      const title = resolveLocalizedText(item.title, language);
      if (title === undefined) return null;
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
          <FadeSlideIn index={index}>
            <ServiceCard
              id={item.id}
              title={title.text}
              provider={item.provider_name}
              location={item.location}
              cost={cost}
              availability={availability}
              interested={item.interested}
              interestedLabel={t('playerServices:interestSaved')}
              imageObjectKey={firstImage?.url ?? null}
              imageAlt={imageAlt?.text ?? null}
              accessibilityLabel={[
                t('playerServices:openService', { title: title.text }),
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
          </FadeSlideIn>
        </PageWidth>
      );
    },
    [currencyFormatter, language, languageFontClass, openService, t],
  );

  if (categoriesQuery.isPending && categoriesQuery.data === undefined) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('playerServices:loading')} />;
  }
  if (categoriesQuery.isError && categoriesQuery.data === undefined) {
    return (
      <AnnouncementFeedError
        message={t('playerServices:loadFailed')}
        retryLabel={t('playerServices:retry')}
        code={toAppError(categoriesQuery.error).code}
        languageFontClass={languageFontClass}
        onRetry={() => void categoriesQuery.refetch()}
      />
    );
  }

  if (category === null || selectedCategoryName === undefined) {
    return (
      <ScrollView
        testID="player-services-categories"
        style={styles.screen}
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
      >
        <PageWidth className="gap-lg">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('playerServices:title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('playerServices:intro')}
            </Text>
          </View>
          {isOffline ? (
            <OfflineBanner
              label={t('playerServices:offline')}
              languageFontClass={languageFontClass}
            />
          ) : null}
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('playerServices:chooseCategory')}
            </Text>
            <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
              {t('playerServices:categoryHint')}
            </Text>
          </View>
          <ServiceCategoryGrid categories={categoriesQuery.data ?? []} onSelect={selectCategory} />
        </PageWidth>
      </ScrollView>
    );
  }

  if (servicesQuery.isPending && servicesQuery.data === undefined) {
    return <AnnouncementFeedSkeleton accessibilityLabel={t('playerServices:loading')} />;
  }
  if (servicesQuery.isError && servicesQuery.data === undefined) {
    return (
      <AnnouncementFeedError
        message={t('playerServices:loadFailed')}
        retryLabel={t('playerServices:retry')}
        code={toAppError(servicesQuery.error).code}
        languageFontClass={languageFontClass}
        onRetry={() => void servicesQuery.refetch()}
      />
    );
  }

  return (
    <FlashList
      testID="player-services-list"
      accessibilityRole="list"
      accessibilityLabel={selectedCategoryName.text}
      data={services}
      renderItem={renderService}
      keyExtractor={keyExtractor}
      style={styles.screen}
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      refreshing={servicesQuery.isRefetching && !isOffline}
      onRefresh={refresh}
      ListHeaderComponent={
        <PageWidth className="gap-lg pb-lg">
          <PressableScale
            accessibilityLabel={t('playerServices:backCategories')}
            onPress={backToCategories}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
          >
            <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
              {t('playerServices:backCategories')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {selectedCategoryName.text}
            </Text>
            <Text
              className={`text-start text-sm tabular-nums text-neutral-600 ${languageFontClass}`}
            >
              {t('playerServices:resultsCount', { count: services.length })}
            </Text>
          </View>
          {isOffline ? (
            <OfflineBanner
              label={t('playerServices:offline')}
              languageFontClass={languageFontClass}
            />
          ) : null}
          <PressableScale
            accessibilityLabel={
              filtersVisible
                ? t('playerServices:filterHide')
                : selectedFilterCount > 0
                  ? t('playerServices:filterShowActive', { count: selectedFilterCount })
                  : t('playerServices:filterShow')
            }
            onPress={toggleFilters}
            haptic="tapLight"
            className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
          >
            <Text className={`text-md font-bold text-primary-dark ${languageFontClass}`}>
              {filtersVisible
                ? t('playerServices:filterHide')
                : selectedFilterCount > 0
                  ? t('playerServices:filterShowActive', { count: selectedFilterCount })
                  : t('playerServices:filterShow')}
            </Text>
          </PressableScale>
          {filtersVisible ? (
            <ServiceFilterPanel
              contract={category.contract}
              availableServices={availableServices}
              selection={filters}
              onChange={setFilters}
              onClear={clearFilters}
            />
          ) : null}
        </PageWidth>
      }
      ListEmptyComponent={
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
      }
    />
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
