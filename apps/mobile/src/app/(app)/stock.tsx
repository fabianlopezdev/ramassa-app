/**
 * Stock (RAPP-250): what the team has, item by item and size by size, and the
 * goods received lately with their photos. Opens from More, or from a large
 * button on the simple home. Recording an arrival needs `equipment.receive`.
 * Holders of `equipment.items` add items here and open each item's editor from
 * its card (RAPP-800), so no separate item list sits between.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { StaffCheckouts } from '@/components/equipment/staff-checkouts';
import { FailureNotice } from '@/components/error-code-line';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ActionScreen } from '@/components/layout/screen-action';
import { ScreenSection } from '@/components/layout/screen-section';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useHandoverItemTypes } from '@/lib/handover';
import { useItemLabel } from '@/lib/item-label';
import { resolveMediaImageSource } from '@/lib/media-source';
import { useRecentArrivals, useStockLevels } from '@/lib/stock';
import { stockItemRows } from '@/lib/stock-items';
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
import type { ArrivalSummary } from '@ramassa/shared/equipment';
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
  const itemLabel = useItemLabel();
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
                ? itemLabel(line.itemKey)
                : `${itemLabel(line.itemKey)} ${line.size}`,
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

function StockItemName({
  label,
  isActive,
}: {
  readonly label: string;
  readonly isActive: boolean;
}) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  return (
    <View className="flex-row flex-wrap items-baseline gap-sm">
      <Text
        className={`text-start text-md font-semibold ${isActive ? 'text-neutral-900' : 'text-neutral-600'} ${fontClass}`}
      >
        {label}
      </Text>
      {isActive ? null : (
        <Text className={`text-sm text-neutral-600 ${fontClass}`}>{t('items.inactive')}</Text>
      )}
    </View>
  );
}

export default function StockScreen() {
  const { t, i18n } = useTranslation('participants');
  const itemLabel = useItemLabel();
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const { permissions } = useAccountAccess();
  const canReceive = permissions.has('equipment.receive');
  const canCount = permissions.has('equipment.count');
  const canCheckOut = canReceive || canCount;
  const canEditItems = permissions.has('equipment.items');
  const levels = useStockLevels();
  const arrivals = useRecentArrivals();
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const itemTypes = useHandoverItemTypes();
  const items = useMemo(
    () =>
      stockItemRows({
        types: itemTypes.data ?? [],
        levels: levels.data ?? [],
        label: itemLabel,
        locale,
        includeInactive: canEditItems,
      }),
    [canEditItems, itemLabel, itemTypes.data, levels.data, locale],
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['left', 'right']}>
      <ActionScreen
        action={
          canReceive ? (
            <AuthSubmitButton
              testID="stock-record-arrival"
              label={t('stock.recordArrival')}
              onPress={() => push('/arrival/new' as Href)}
            />
          ) : null
        }
      >
        <NativeScreenHeader title={t('stock.title')} />
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
          <PageWidth className="gap-lg p-lg">
            <View className="gap-xs">
              <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                {t('stock.intro')}
              </Text>
            </View>

            {canCheckOut ? (
              <RaisedActionButton
                testID="stock-check-out"
                label={t('checkout.action')}
                onPress={() => push('/checkout/new' as Href)}
              />
            ) : null}

            {canEditItems ? (
              <RaisedActionButton
                testID="items-add"
                label={t('items.add')}
                onPress={() => push('/item-type/new' as Href)}
              />
            ) : null}

            <ScreenSection testID="stock-levels" title={t('stock.levelsTitle')}>
              {levels.isPending ? (
                <ActivityIndicator color={tokens.colors.primary.DEFAULT} />
              ) : null}
              {levels.isError ? (
                <FailureNotice
                  code={toAppError(levels.error).code}
                  message={t('stock.loadFailed')}
                />
              ) : null}
              {levels.isSuccess && itemTypes.isSuccess && items.length === 0 ? (
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
                    {canEditItems && item.typeId !== null ? (
                      <PressableScale
                        testID={`items-row-${item.itemKey}`}
                        accessibilityRole="button"
                        accessibilityLabel={
                          item.isActive ? item.label : `${item.label}, ${t('items.inactive')}`
                        }
                        onPress={() => push(`/item-type/${item.typeId}` as Href)}
                        haptic="selection"
                        className="min-h-recommended flex-1 justify-center"
                      >
                        <StockItemName label={item.label} isActive={item.isActive} />
                      </PressableScale>
                    ) : (
                      <View className="flex-1">
                        <StockItemName label={item.label} isActive={item.isActive} />
                      </View>
                    )}
                    {canCount && item.typeId !== null ? (
                      <PressableScale
                        testID={`stock-count-${item.itemKey}`}
                        accessibilityRole="button"
                        accessibilityLabel={t('count.actionLabel', { item: item.label })}
                        onPress={() => push(`/count/${item.typeId}` as Href)}
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
            </ScreenSection>

            <StaffCheckouts canCheckIn={canCheckOut} />

            <ScreenSection testID="stock-arrivals" title={t('stock.arrivalsTitle')} isLast>
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
            </ScreenSection>
          </PageWidth>
        </ScrollView>
      </ActionScreen>
    </SafeAreaView>
  );
}
