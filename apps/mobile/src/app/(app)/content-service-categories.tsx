/**
 * Service categories on the phone (RAPP-347), for `services.edit` holders: the
 * categories in the order players see them, with how many own fields each
 * has, Up and Down to reorder them, and New, Edit and Delete. New and Edit
 * open the category editor (`content-service-category/[id]`). A category that
 * still has services cannot be deleted; the database refuses it and the
 * screen says so.
 */
import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { SERVICE_ICON_SYMBOLS } from '@/components/content/service-labels';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useContentServiceCategories, useServiceCategoryActions } from '@/lib/content-services';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@ramassa/shared/i18n';
import type { AdminServiceCategory } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';

function RowAction({
  testID,
  label,
  onPress,
  isDisabled = false,
  isDestructive = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isDisabled?: boolean;
  readonly isDestructive?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isDisabled={isDisabled}
      haptic="tapLight"
      className="min-h-recommended justify-center px-xs"
    >
      <Text
        className={`font-semibold ${
          isDisabled ? 'text-neutral-400' : isDestructive ? 'text-error' : 'text-primary-dark'
        } ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export default function ServiceCategoriesScreen() {
  const { t, i18n } = useTranslation('services');
  const { t: tCommon } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const { back, push } = useRouter();
  const categories = useContentServiceCategories();
  const { reorder, remove } = useServiceCategoryActions();
  const rows = categories.data ?? [];

  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= rows.length) return;
    const ids = rows.map((row) => row.id);
    [ids[index], ids[destination]] = [ids[destination] ?? '', ids[index] ?? ''];
    reorder.mutate(ids);
  };
  const confirmDelete = (category: AdminServiceCategory) => {
    const done = () => remove.mutate(category.id, { onSuccess: () => playHaptic('success') });
    // The web build has no native alert, so it asks through the browser.
    if (Platform.OS === 'web') {
      if (window.confirm(t('categoryDeleteConfirm'))) done();
      return;
    }
    Alert.alert(t('categoryDeleteConfirm'), category.name[language] ?? category.name.ca, [
      { text: tProfile('cancelAction'), style: 'cancel' },
      { text: t('categoryDelete'), style: 'destructive', onPress: done },
    ]);
  };
  const failure = remove.error ?? reorder.error;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <PageWidth className="flex-1">
        <ScrollView contentContainerClassName="gap-md p-lg" testID="service-categories">
          <PressableScale
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <Text
            accessibilityRole="header"
            className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('categoriesTitle')}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('categoriesHelpPhone')}
          </Text>
          <PressableScale
            testID="service-category-new"
            accessibilityRole="button"
            accessibilityLabel={t('newCategory')}
            onPress={() => push('/content-service-category/new' as Href)}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center self-start rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {t('newCategory')}
            </Text>
          </PressableScale>
          {failure === null ? null : (
            <FailureNotice
              code={toAppError(failure).code}
              message={tErrors(getErrorMessageKey(toAppError(failure).code))}
            />
          )}
          {categories.isPending ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('categoriesTitle')} />
          ) : categories.isError ? (
            <AnnouncementFeedError
              message={t('loadFailed')}
              retryLabel={tErrors('retry')}
              code={toAppError(categories.error).code}
              languageFontClass={fontClass}
              onRetry={() => void categories.refetch()}
              isLoading={categories.isFetching}
            />
          ) : (
            <View className="gap-sm" accessibilityRole="list">
              {rows.map((category, index) => {
                const symbol =
                  SERVICE_ICON_SYMBOLS[category.icon as keyof typeof SERVICE_ICON_SYMBOLS];
                return (
                  <View
                    key={category.id}
                    testID={`service-category-row-${category.id}`}
                    style={continuousCorners}
                    className="gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
                  >
                    <View className="flex-row items-center gap-xs">
                      {symbol === undefined ? null : (
                        <SymbolView
                          name={symbol}
                          size={18}
                          tintColor={tokens.colors.primary.DEFAULT}
                        />
                      )}
                      <Text
                        className={`flex-1 text-start text-md font-semibold text-neutral-900 ${fontClass}`}
                      >
                        {category.name[language] ?? category.name.ca}
                      </Text>
                    </View>
                    <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                      {`${category.slug} · ${t('fieldsTitle')}: ${category.metadataSchema.fields.length}`}
                    </Text>
                    <View className="flex-row flex-wrap gap-sm">
                      <RowAction
                        testID={`service-category-up-${category.id}`}
                        label={t('categoryMoveUp')}
                        onPress={() => move(index, -1)}
                        isDisabled={index === 0 || reorder.isPending}
                      />
                      <RowAction
                        testID={`service-category-down-${category.id}`}
                        label={t('categoryMoveDown')}
                        onPress={() => move(index, 1)}
                        isDisabled={index === rows.length - 1 || reorder.isPending}
                      />
                      <RowAction
                        testID={`service-category-edit-${category.id}`}
                        label={t('categoryEdit')}
                        onPress={() => push(`/content-service-category/${category.id}` as Href)}
                      />
                      <RowAction
                        testID={`service-category-delete-${category.id}`}
                        label={t('categoryDelete')}
                        onPress={() => confirmDelete(category)}
                        isDestructive
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </PageWidth>
    </SafeAreaView>
  );
}
