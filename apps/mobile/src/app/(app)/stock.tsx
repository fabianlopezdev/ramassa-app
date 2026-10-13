/**
 * Stock (RAPP-250): what the team has, item by item and size by size, and the
 * goods received lately with their photos. Opens from More, or from a large
 * button on the simple home. Recording an arrival needs `equipment.receive`.
 */
import { StaffCheckouts } from '@/components/equipment/staff-checkouts';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useHandoverItemTypes } from '@/lib/handover';
import { resolveMediaImageSource } from '@/lib/media-source';
import { useRecentArrivals, useStockLevels } from '@/lib/stock';
import { mobileClientEnv } from '@/lib/supabase';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import type { ArrivalSummary, StockLevel } from '@ramassa/shared/equipment';
import { toAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

// Grey behind the photo, so one that cannot load still reads as a photo tile.
const photoStyle = {
  width: 96,
  height: 96,
  borderRadius: tokens.radius.md,
  backgroundColor: tokens.colors.neutral[100],
} as const;

function ArrivalPhoto({
  objectKey,
  label,
}: {
  readonly objectKey: string;
  readonly label: string;
}) {
  const accessToken = useAuth().session?.access_token;
  const source = useMemo(
    () =>
      resolveMediaImageSource({
        objectKeyOrUrl: objectKey,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        accessToken,
      }),
    [accessToken, objectKey],
  );
  return <Image source={source} style={photoStyle} contentFit="cover" accessibilityLabel={label} />;
}

function ArrivalCard({ arrival }: { readonly arrival: ArrivalSummary }) {
  const { t, i18n } = useTranslation('participants');
  const { t: tEquipment } = useTranslation('equipment');
  const fontClass = useLanguageFontClass();
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: MADRID_TIME_ZONE,
  }).format(new Date(arrival.receivedAt));
  const source = t(`stock.source.${arrival.source}`);
  const heading =
    arrival.sourceName === null
      ? source
      : t('stock.arrivalFrom', { source, name: arrival.sourceName });
  return (
    <View
      testID={`stock-arrival-${arrival.id}`}
      style={continuousCorners}
      className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
    >
      <View className="flex-row flex-wrap items-baseline justify-between gap-sm">
        <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
          {heading}
        </Text>
        <Text className={`text-sm text-neutral-600 ${fontClass}`}>{date}</Text>
      </View>
      {arrival.lines.map((line, index) => (
        <Text
          // An arrival's lines never change once saved.
          key={`${line.itemKey}-${line.size ?? ''}-${index}`}
          className={`text-start text-sm text-neutral-700 ${fontClass}`}
        >
          {t('arrival.lineSummary', {
            item:
              line.size === null
                ? tEquipment(line.itemKey)
                : `${tEquipment(line.itemKey)} ${line.size}`,
            quantity: line.quantity,
          })}
        </Text>
      ))}
      {arrival.totalCostCents === null ? null : (
        <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
          {t('stock.totalPaid', {
            amount: new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(
              arrival.totalCostCents / 100,
            ),
          })}
        </Text>
      )}
      {arrival.problems === null ? null : (
        <Text className={`text-start text-sm text-neutral-800 ${fontClass}`}>
          {t('stock.problems', { text: arrival.problems })}
        </Text>
      )}
      {arrival.photos.length === 0 ? null : (
        <View className="flex-row flex-wrap gap-sm pt-xs">
          {arrival.photos.map((photo) => (
            <ArrivalPhoto
              key={photo.objectKey}
              objectKey={photo.objectKey}
              label={t(`stock.photo.${photo.kind}`)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function groupByItem(
  levels: readonly StockLevel[],
  label: (key: string) => string,
  sizeOrder: ReadonlyMap<string, readonly string[]>,
  locale: string,
) {
  const byItem = new Map<string, StockLevel[]>();
  for (const level of levels) {
    byItem.set(level.itemKey, [...(byItem.get(level.itemKey) ?? []), level]);
  }
  // Sizes in the item's own order (XS, S, M, L), never alphabetical.
  const rank = (itemKey: string, size: string | null) => {
    const at = size === null ? -1 : (sizeOrder.get(itemKey)?.indexOf(size) ?? -1);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...byItem.entries()]
    .map(([itemKey, sizes]) => ({
      itemKey,
      label: label(itemKey),
      sizes: sizes.sort((left, right) => rank(itemKey, left.size) - rank(itemKey, right.size)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, locale));
}

export default function StockScreen() {
  const { t, i18n } = useTranslation('participants');
  const { t: tEquipment } = useTranslation('equipment');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const { permissions } = useAccountAccess();
  const canReceive = permissions.has('equipment.receive');
  const canCount = permissions.has('equipment.count');
  const canCheckOut = canReceive || canCount;
  const levels = useStockLevels();
  const arrivals = useRecentArrivals();
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const itemTypes = useHandoverItemTypes();
  const typeIds = useMemo(
    () => new Map((itemTypes.data ?? []).map((type) => [type.key, type.id] as const)),
    [itemTypes.data],
  );
  const sizeOrder = useMemo(
    () => new Map((itemTypes.data ?? []).map((type) => [type.key, type.sizes] as const)),
    [itemTypes.data],
  );
  const items = useMemo(
    () => groupByItem(levels.data ?? [], (key) => tEquipment(key), sizeOrder, locale),
    [levels.data, locale, sizeOrder, tEquipment],
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="stock-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('stock.title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('stock.intro')}
            </Text>
          </View>
          {canReceive ? (
            <PressableScale
              testID="stock-record-arrival"
              accessibilityRole="button"
              accessibilityLabel={t('stock.recordArrival')}
              onPress={() => push('/arrival/new' as Href)}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
                {t('stock.recordArrival')}
              </Text>
            </PressableScale>
          ) : null}

          {canCheckOut ? (
            <PressableScale
              testID="stock-check-out"
              accessibilityRole="button"
              accessibilityLabel={t('checkout.action')}
              onPress={() => push('/checkout/new' as Href)}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
            >
              <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                {t('checkout.action')}
              </Text>
            </PressableScale>
          ) : null}

          <View className="gap-sm" testID="stock-levels">
            <Text
              accessibilityRole="header"
              className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('stock.levelsTitle')}
            </Text>
            {levels.isPending ? <ActivityIndicator color={tokens.colors.primary.DEFAULT} /> : null}
            {levels.isError ? (
              <FailureNotice code={toAppError(levels.error).code} message={t('stock.loadFailed')} />
            ) : null}
            {levels.isSuccess && items.length === 0 ? (
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('stock.levelsEmpty')}
              </Text>
            ) : null}
            {items.map((item) => (
              <View
                key={item.itemKey}
                testID={`stock-item-${item.itemKey}`}
                style={continuousCorners}
                className="gap-sm rounded-md border border-neutral-200 bg-white p-md"
              >
                <View className="flex-row items-center justify-between gap-sm">
                  <Text
                    className={`flex-1 text-start text-md font-semibold text-neutral-900 ${fontClass}`}
                  >
                    {item.label}
                  </Text>
                  {canCount && typeIds.has(item.itemKey) ? (
                    <PressableScale
                      testID={`stock-count-${item.itemKey}`}
                      accessibilityRole="button"
                      accessibilityLabel={t('count.actionLabel', { item: item.label })}
                      onPress={() => push(`/count/${typeIds.get(item.itemKey)}` as Href)}
                      haptic="tapLight"
                      className="min-h-recommended justify-center px-sm"
                    >
                      <Text className={`font-semibold text-primary-dark ${fontClass}`}>
                        {t('count.action')}
                      </Text>
                    </PressableScale>
                  ) : null}
                </View>
                <View className="flex-row flex-wrap gap-sm">
                  {item.sizes.map((level) => {
                    const below = level.quantity < 0;
                    const text =
                      level.size === null
                        ? String(level.quantity)
                        : `${level.size}: ${level.quantity}`;
                    return (
                      <View
                        key={level.size ?? ''}
                        accessible
                        accessibilityLabel={below ? `${text}. ${t('stock.belowZero')}` : text}
                        style={continuousCorners}
                        className={`rounded-sm px-sm py-xs ${below ? 'border border-error bg-white' : 'bg-neutral-100'}`}
                      >
                        <Text
                          className={`text-sm font-semibold ${below ? 'text-error' : 'text-neutral-800'} ${fontClass}`}
                        >
                          {text}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          <StaffCheckouts canCheckIn={canCheckOut} />

          <View className="gap-sm" testID="stock-arrivals">
            <Text
              accessibilityRole="header"
              className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('stock.arrivalsTitle')}
            </Text>
            {arrivals.isSuccess && arrivals.data.length === 0 ? (
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('stock.arrivalsEmpty')}
              </Text>
            ) : null}
            {arrivals.isError ? (
              <FailureNotice
                code={toAppError(arrivals.error).code}
                message={t('stock.loadFailed')}
              />
            ) : null}
            {(arrivals.data ?? []).map((arrival) => (
              <ArrivalCard key={arrival.id} arrival={arrival} />
            ))}
          </View>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
