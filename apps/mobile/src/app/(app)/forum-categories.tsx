/**
 * Forum categories on the phone (RAPP-386), for `forum.moderate` holders, as
 * the category manager under the web admin's forum moderation: the categories
 * in the order participants see them, Up and Down to reorder them (the web
 * admin takes an order number), and New, Edit and Delete. Changes open in a
 * sheet. A category that still has posts cannot be deleted; the database
 * refuses it and the screen says so.
 */
import {
  AnnouncementFeedError,
  AnnouncementFeedSkeleton,
} from '@/components/announcements/feed-states';
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ForumCategorySheet } from '@/components/team/forum-category-sheet';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useForumCategoryActions, useForumModerationCategories } from '@/lib/team-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toAppError } from '@ramassa/shared/errors';
import type { ForumCategoryRow } from '@ramassa/shared/forum';
import {
  DEFAULT_LANGUAGE,
  resolveLocalizedText,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

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

export default function ForumCategoriesScreen() {
  const { t, i18n } = useTranslation('forum');
  const { t: tEvents } = useTranslation('events');
  const { t: tCommon } = useTranslation('common');
  const { t: tProfile } = useTranslation('profile');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const language = (i18n.resolvedLanguage ?? DEFAULT_LANGUAGE) as SupportedLanguage;
  const categories = useForumModerationCategories();
  const { reorder, remove } = useForumCategoryActions();
  const [sheet, setSheet] = useState<{ readonly category: ForumCategoryRow | null } | null>(null);
  const rows = categories.data ?? [];
  const nextSortOrder = rows.reduce((highest, row) => Math.max(highest, row.sort_order), 0) + 10;

  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    const moving = rows[index];
    const other = rows[destination];
    if (moving === undefined || other === undefined) return;
    const ordered = [...rows];
    ordered[index] = other;
    ordered[destination] = moving;
    reorder.mutate(ordered);
  };
  const confirmDelete = (category: ForumCategoryRow) => {
    const done = () => remove.mutate(category.id, { onSuccess: () => playHaptic('success') });
    // The web build has no native alert, so it asks through the browser.
    if (Platform.OS === 'web') {
      if (window.confirm(t('categoryDeleteConfirm'))) done();
      return;
    }
    Alert.alert(t('categoryDeleteConfirm'), category.name.ca ?? category.slug, [
      { text: tProfile('cancelAction'), style: 'cancel' },
      { text: t('categoryDelete'), style: 'destructive', onPress: done },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <PageWidth className="flex-1">
        <ScrollView contentContainerClassName="gap-md p-lg" testID="forum-categories">
          <PressableScale
            testID="forum-categories-back"
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
            {t('categoryManagerTitle')}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {tEvents('categoriesHelpPhone')}
          </Text>
          <PressableScale
            testID="forum-category-new"
            accessibilityRole="button"
            accessibilityLabel={tEvents('newCategory')}
            onPress={() => setSheet({ category: null })}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center self-start rounded-md bg-primary px-lg"
          >
            <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
              {tEvents('newCategory')}
            </Text>
          </PressableScale>
          {remove.isError ? (
            <FailureNotice code="DB-1" message={t('categoryDeleteFailed')} />
          ) : reorder.isError ? (
            <FailureNotice code="DB-1" message={t('categorySaveFailed')} />
          ) : null}
          {categories.isPending ? (
            <AnnouncementFeedSkeleton accessibilityLabel={t('categoryManagerTitle')} />
          ) : categories.isError ? (
            <AnnouncementFeedError
              message={t('categorySaveFailed')}
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
                  testID={`forum-category-row-${category.slug}`}
                  style={continuousCorners}
                  className="gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
                >
                  <Text className={`text-start text-md font-bold text-neutral-900 ${fontClass}`}>
                    {resolveLocalizedText(category.name, language)?.text ?? category.slug}
                  </Text>
                  <Text className="text-start text-sm text-neutral-600">{category.slug}</Text>
                  <View className="flex-row flex-wrap gap-sm">
                    <RowAction
                      testID={`forum-category-up-${category.slug}`}
                      label={tEvents('categoryMoveUp')}
                      onPress={() => move(index, -1)}
                      isDisabled={index === 0 || reorder.isPending}
                    />
                    <RowAction
                      testID={`forum-category-down-${category.slug}`}
                      label={tEvents('categoryMoveDown')}
                      onPress={() => move(index, 1)}
                      isDisabled={index === rows.length - 1 || reorder.isPending}
                    />
                    <RowAction
                      testID={`forum-category-edit-${category.slug}`}
                      label={t('categoryEdit')}
                      onPress={() => setSheet({ category })}
                    />
                    <RowAction
                      testID={`forum-category-delete-${category.slug}`}
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
      <ForumCategorySheet
        visible={sheet !== null}
        category={sheet?.category ?? null}
        nextSortOrder={nextSortOrder}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}
