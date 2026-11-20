/**
 * Her own forum post's actions (RAPP-884). Delete and edit are small icon
 * buttons at the start of the post's action row, before reply, with delete
 * furthest from reply so a missed tap does not reach it; the confirmation
 * before deleting and the error when either fails sit under the row. The
 * screen keeps the state; these only draw it.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { OWN_POST_HIT_SLOPS } from '@/components/forum/forum-thread-message';
import { continuousCorners } from '@/lib/continuous-corners';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export const ForumOwnPostIcons = memo(function ForumOwnPostIcons({
  isOnline,
  isDeleting,
  onEdit,
  onAskDelete,
}: {
  readonly isOnline: boolean;
  readonly isDeleting: boolean;
  readonly onEdit: () => void;
  readonly onAskDelete: () => void;
}) {
  const { t } = useTranslation('forum');
  return (
    <>
      <RaisedActionButton
        testID="forum-delete"
        size="compact"
        icon="trash"
        tone="danger"
        isLabelHidden
        iconFace="small"
        hitSlop={OWN_POST_HIT_SLOPS.delete}
        label={t('delete')}
        onPress={onAskDelete}
        isDisabled={!isOnline || isDeleting}
      />
      <RaisedActionButton
        testID="forum-edit"
        size="compact"
        icon="pencil"
        isLabelHidden
        hitSlop={OWN_POST_HIT_SLOPS.edit}
        label={t('edit')}
        onPress={onEdit}
        isDisabled={!isOnline}
      />
    </>
  );
});

export const ForumOwnPostActions = memo(function ForumOwnPostActions({
  isConfirmingDelete,
  isDeleting,
  onCancelDelete,
  onConfirmDelete,
  errorMessage,
  languageFontClass,
}: {
  readonly isConfirmingDelete: boolean;
  readonly isDeleting: boolean;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly errorMessage: string | null;
  readonly languageFontClass: string;
}) {
  const { t } = useTranslation('forum');
  return (
    <>
      {!isConfirmingDelete ? null : (
        <View
          accessibilityRole="alert"
          className="gap-md rounded-lg border border-error bg-white p-md"
          style={continuousCorners}
        >
          <Text
            accessibilityRole="header"
            className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('deleteConfirmTitle')}
          </Text>
          <Text className={`text-start text-md text-neutral-700 ${languageFontClass}`}>
            {t('deleteConfirmBody')}
          </Text>
          <View className="flex-row gap-sm">
            <View className="flex-1">
              <RaisedActionButton label={t('cancel')} onPress={onCancelDelete} />
            </View>
            <View className="flex-1">
              <RaisedActionButton
                testID="forum-confirm-delete"
                tone="danger"
                label={t('deleteConfirm')}
                onPress={onConfirmDelete}
                isDisabled={isDeleting}
              />
            </View>
          </View>
        </View>
      )}
      {errorMessage === null ? null : (
        <Text
          selectable
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {errorMessage}
        </Text>
      )}
    </>
  );
});
