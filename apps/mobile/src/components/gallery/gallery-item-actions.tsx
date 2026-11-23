/**
 * What an opened gallery item offers under its title (RAPP-931): who shared
 * it, the report flag for anyone who may report it (RAPP-892), and for her
 * own items, or for the staff, who can see it and the delete button. The
 * video screen shows it under the player; the lightbox shows it on a photo.
 */
import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { ForumFlagButton } from '@/components/forum/forum-flag-button';
import { ForumFlagDialog } from '@/components/forum/forum-flag-dialog';
import { playHaptic } from '@/lib/haptics/haptics';
import { useDeleteGalleryItem, useSetGalleryPrivacy } from '@/lib/player-gallery';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import type { ForumFlagInput } from '@ramassa/shared/forum';
import type { MediaItemRow, MediaPrivacy } from '@ramassa/shared/media';

const MEDIA_PRIVACY_OPTIONS: readonly MediaPrivacy[] = ['community', 'staff_only'];
/** The line of who shared it: grey on the page, white on a photo. */
const SHARED_BY_CLASS = {
  page: 'text-neutral-600',
  photo: 'text-white',
} as const;

export function GalleryItemActions({
  item,
  surface,
  onDeleted,
}: {
  readonly item: MediaItemRow;
  /** Where it is drawn: on the white page, or on the fade over a photo. */
  readonly surface: keyof typeof SHARED_BY_CLASS;
  /** After the item was deleted, such as going back. */
  readonly onDeleted: () => void;
}) {
  const { t } = useTranslation(['gallery', 'forum']);
  const languageFontClass = useLanguageFontClass();
  const { user, role } = useAuth();
  const canManage = item.uploaded_by === user?.id || role === 'staff' || role === 'admin';
  const privacyMutation = useSetGalleryPrivacy(item.id);
  const deleteMutation = useDeleteGalleryItem(item.id);
  const mutatePrivacy = privacyMutation.mutate;
  const deleteItem = deleteMutation.mutateAsync;
  const [flagTarget, setFlagTarget] = useState<Pick<
    ForumFlagInput,
    'targetType' | 'targetId'
  > | null>(null);

  const privacyActions = useMemo<Record<MediaPrivacy, () => void>>(
    () => ({
      community: () => mutatePrivacy('community'),
      staff_only: () => mutatePrivacy('staff_only'),
    }),
    [mutatePrivacy],
  );
  const selectedPrivacy = item.privacy_level;
  const renderPrivacyOption = useCallback(
    (value: MediaPrivacy) => (
      <SelectionChoiceCard
        key={value}
        label={t(`gallery:privacyLevels.${value}`)}
        fontClass={languageFontClass}
        isSelected={selectedPrivacy === value}
        onPress={privacyActions[value]}
      />
    ),
    [languageFontClass, privacyActions, selectedPrivacy, t],
  );
  const flagMedia = useCallback(
    () => setFlagTarget({ targetType: 'media', targetId: item.id }),
    [item.id],
  );
  const closeFlagDialog = useCallback(() => setFlagTarget(null), []);
  const confirmFlag = useCallback(() => {
    setFlagTarget(null);
    Alert.alert(t('forum:flagConfirmationTitle'), t('forum:flagConfirmation'));
  }, [t]);
  const confirmDelete = useCallback(() => {
    Alert.alert(t('gallery:deleteTitle'), t('gallery:deleteBody'), [
      { text: t('gallery:cancel'), style: 'cancel' },
      {
        text: t('gallery:delete'),
        style: 'destructive',
        onPress: () => {
          playHaptic('warning');
          void deleteItem().then(onDeleted);
        },
      },
    ]);
  }, [deleteItem, onDeleted, t]);

  const sharedByClass = `flex-1 text-start text-sm ${SHARED_BY_CLASS[surface]} ${languageFontClass}`;
  return (
    <>
      <View className="flex-row items-center gap-sm">
        <Text className={sharedByClass}>
          {t('gallery:mediaBy', { name: item.uploader_first_name })}
        </Text>
        {canManage ? null : (
          <ForumFlagButton
            testID="gallery-flag"
            accessibilityLabel={t('gallery:flag')}
            onPress={flagMedia}
          />
        )}
      </View>
      {canManage ? (
        <>
          <View
            testID="gallery-privacy-picker"
            accessibilityRole="radiogroup"
            accessibilityLabel={t('gallery:privacy')}
            className="gap-sm"
          >
            {MEDIA_PRIVACY_OPTIONS.map(renderPrivacyOption)}
          </View>
          <RaisedActionButton
            testID="gallery-delete"
            tone="danger"
            label={t('gallery:delete')}
            onPress={confirmDelete}
            isDisabled={deleteMutation.isPending}
          />
        </>
      ) : null}
      <ForumFlagDialog target={flagTarget} onClose={closeFlagDialog} onConfirmed={confirmFlag} />
    </>
  );
}
