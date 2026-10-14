/**
 * Event categories on the phone (RAPP-342), for `events.edit` holders: the
 * categories in the order the players see them, Up and Down to reorder them
 * (the web admin also lets her drag), and New, Edit and Delete. Changes open
 * in a sheet. A category that still has events cannot be deleted; the
 * database refuses it and the screen says so.
 */
import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { EventCategoryBadge } from '@/components/content/event-category-badge';
import { EventCategorySheet } from '@/components/content/event-category-sheet';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { useContentEventCategories, useEventCategoryActions } from '@/lib/content-events';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessageKey, toAppError } from '@ramassa/shared/errors';
import type { EventCategoryRow } from '@ramassa/shared/events';

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

export default function EventCategoriesScreen() {
  const { t } = useTranslation('events');
  const { t: tCommon } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const categories = useContentEventCategories();
  const { reorder, remove } = useEventCategoryActions();
  const [sheet, setSheet] = useState<{ readonly category: EventCategoryRow | null } | null>(null);
  const rows = categories.data ?? [];

  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= rows.length) return;
    const ids = rows.map((row) => row.id);
    [ids[index], ids[destination]] = [ids[destination] ?? '', ids[index] ?? ''];
    reorder.mutate(ids);
  };
  const confirmDelete = (category: EventCategoryRow) => {
    const done = () => remove.mutate(category.id, { onSuccess: () => playHaptic('success') });
    // The web build has no native alert, so it asks through the browser.
    if (Platform.OS === 'web') {
      if (window.confirm(t('categoryDeleteConfirm'))) done();
      return;
    }
    Alert.alert(t('categoryDeleteConfirm'), category.name.ca, [
      { text: tProfile('cancelAction'), style: 'cancel' },
      { text: t('categoryDelete'), style: 'destructive', onPress: done },
    ]);
  };
  const failure = remove.error ?? reorder.error;

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <PageWidth className="flex-1">
        <ScrollView contentContainerClassName="gap-md p-lg" testID="event-categories">
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
            testID="event-category-new"
            accessibilityRole="button"
            accessibilityLabel={t('newCategory')}
            onPress={() => setSheet({ category: null })}
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
              message={t('playerLoadFailed')}
              retryLabel={tErrors('retry')}
              code={toAppError(categories.error).code}
              languageFontClass={fontClass}
              onRetry={() => void categories.refetch()}
              isLoading={categories.isFetching}
            />
          ) : (
            <View className="gap-sm" accessibilityRole="list">
              {rows.map((category, index) => (
                <View
                  key={category.id}
                  testID={`event-category-row-${category.id}`}
                  style={continuousCorners}
                  className="gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
                >
                  <EventCategoryBadge category={category} />
                  <View className="flex-row flex-wrap gap-sm">
                    <RowAction
                      testID={`event-category-up-${category.id}`}
                      label={t('categoryMoveUp')}
                      onPress={() => move(index, -1)}
                      isDisabled={index === 0 || reorder.isPending}
                    />
                    <RowAction
                      testID={`event-category-down-${category.id}`}
                      label={t('categoryMoveDown')}
                      onPress={() => move(index, 1)}
                      isDisabled={index === rows.length - 1 || reorder.isPending}
                    />
                    <RowAction
                      testID={`event-category-edit-${category.id}`}
                      label={t('categoryEdit')}
                      onPress={() => setSheet({ category })}
                    />
                    <RowAction
                      testID={`event-category-delete-${category.id}`}
                      label={t('categoryDelete')}
                      onPress={() => confirmDelete(category)}
                      isDestructive
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </PageWidth>
      <EventCategorySheet
        visible={sheet !== null}
        category={sheet?.category ?? null}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}
