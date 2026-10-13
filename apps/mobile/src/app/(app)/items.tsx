/**
 * Items (RAPP-253): the material catalog for holders of `equipment.items`.
 * Built-in and custom items, switched-off ones last, each opening its editor.
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useHandoverItemTypes } from '@/lib/handover';
import { useItemLabel } from '@/lib/item-label';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

export default function ItemsScreen() {
  const { t, i18n } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const itemLabel = useItemLabel();
  const itemTypes = useHandoverItemTypes();
  const locale = i18n.resolvedLanguage ?? DEFAULT_LANGUAGE;
  const types = useMemo(
    () =>
      [...(itemTypes.data ?? [])].sort(
        (left, right) =>
          Number(right.is_active) - Number(left.is_active) ||
          itemLabel(left.key).localeCompare(itemLabel(right.key), locale),
      ),
    [itemLabel, itemTypes.data, locale],
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="items-back"
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
              {t('items.title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('items.intro')}
            </Text>
          </View>
          <PressableScale
            testID="items-add"
            accessibilityRole="button"
            accessibilityLabel={t('items.add')}
            onPress={() => push('/item-type/new' as Href)}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('items.add')}
            </Text>
          </PressableScale>
          {itemTypes.isPending ? <ActivityIndicator color={tokens.colors.primary.DEFAULT} /> : null}
          <View className="gap-sm">
            {types.map((type) => {
              const sizes = type.sizes.length === 0 ? t('items.noSizes') : type.sizes.join(', ');
              const summary = t('items.summary', { kind: t(`items.kind.${type.kind}`), sizes });
              return (
                <PressableScale
                  key={type.id}
                  testID={`items-row-${type.key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${itemLabel(type.key)}, ${summary}${type.is_active ? '' : `, ${t('items.inactive')}`}`}
                  onPress={() => push(`/item-type/${type.id}` as Href)}
                  haptic="selection"
                  style={continuousCorners}
                  className="min-h-recommended justify-center gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
                >
                  <View className="flex-row flex-wrap items-baseline justify-between gap-sm">
                    <Text
                      className={`text-start text-md font-semibold ${type.is_active ? 'text-neutral-900' : 'text-neutral-600'} ${fontClass}`}
                    >
                      {itemLabel(type.key)}
                    </Text>
                    {type.is_active ? null : (
                      <Text className={`text-sm text-neutral-600 ${fontClass}`}>
                        {t('items.inactive')}
                      </Text>
                    )}
                  </View>
                  <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
                    {summary}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
