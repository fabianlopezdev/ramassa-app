/**
 * Edit and Delete under her own forum post, the confirmation before it is
 * deleted, and the error when either fails (RAPP-884). The screen keeps the
 * state; this only draws it inside the post's body column.
 */
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { continuousCorners } from '@/lib/continuous-corners';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export const ForumOwnPostActions = memo(function ForumOwnPostActions({
  showsActions,
  isConfirmingDelete,
  isOnline,
  isDeleting,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  errorMessage,
  languageFontClass,
}: {
  /** Edit and Delete show on her own post while she is not editing or confirming. */
  readonly showsActions: boolean;
  readonly isConfirmingDelete: boolean;
  readonly isOnline: boolean;
  readonly isDeleting: boolean;
  readonly onEdit: () => void;
  readonly onAskDelete: () => void;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly errorMessage: string | null;
  readonly languageFontClass: string;
}) {
  const { t } = useTranslation('forum');
  return (
    <>
      {showsActions ? (
        <View className="flex-row gap-sm">
          <View className="flex-1">
            <RaisedActionButton
              testID="forum-edit"
              label={t('edit')}
              onPress={onEdit}
              isDisabled={!isOnline}
            />
          </View>
          <View className="flex-1">
            <RaisedActionButton
              testID="forum-delete"
              tone="danger"
              label={t('delete')}
              onPress={onAskDelete}
              isDisabled={!isOnline || isDeleting}
            />
          </View>
        </View>
      ) : null}
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
