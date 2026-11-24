import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { FailureNotice } from '@/components/error-code-line';
import { Icon } from '@/components/icons/icon';
import { AppSheet } from '@/components/layout/app-sheet';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SuccessPop } from '@/components/motion/success-pop';
import { PersonAvatar } from '@/components/people/person-avatar';
import { safeAsync } from '@/lib/observability';
import { saveProfilePhoto } from '@/lib/profile-photo';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Text, View } from 'react-native';
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import { ownProfileQueryKey } from '@ramassa/shared/profile';
import type { ProfileRecordWithFields } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

/** The pencil circle: as wide as the minimum tap target, over the photo's lower end corner. */
const EDIT_BADGE_SIZE = tokens.tapTarget.min;
const EDIT_ICON_SIZE = tokens.fontSize.xl;
const EDIT_BADGE_ALONE_STYLE = { width: EDIT_BADGE_SIZE, height: EDIT_BADGE_SIZE } as const;
const EDIT_BADGE_STYLE = {
  width: EDIT_BADGE_SIZE,
  height: EDIT_BADGE_SIZE,
  bottom: -tokens.spacing.xs,
  end: -tokens.spacing.xs,
} as const;

const PHOTO_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
  exif: false,
};

/**
 * Her photo with the button that changes it underneath. `beside` sits to the
 * end of them; the camera and library choices open under the whole row.
 *
 * `badgeOnly` draws the pencil alone, for a screen that already shows her
 * photo large, such as the top of Les meves dades (RAPP-960); what it is doing
 * and any failure then show in the choices sheet.
 */
export function ProfilePhotoEditor({
  profile,
  beside,
  badgeOnly = false,
}: {
  readonly profile: ProfileRecordWithFields;
  readonly beside?: ReactNode;
  readonly badgeOnly?: boolean;
}) {
  const { t } = useTranslation('profile');
  const font = useLanguageFontClass();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AppErrorCode | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [saved, setSaved] = useState(0);
  const working = useRef(false);

  async function change(source: 'camera' | 'library' | 'remove') {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setFailure(null);
    setCameraDenied(false);
    const result = await safeAsync(
      async () => {
        let photo: ImagePicker.ImagePickerAsset | null = null;
        if (source !== 'remove') {
          if (source === 'camera') {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              setCameraDenied(true);
              return;
            }
          }
          const picked =
            source === 'camera'
              ? await ImagePicker.launchCameraAsync(PHOTO_OPTIONS)
              : await ImagePicker.launchImageLibraryAsync(PHOTO_OPTIONS);
          if (picked.canceled) return;
          photo = picked.assets[0] ?? null;
          if (photo === null) throw new AppError('UPLOAD-1');
        }
        const key = await saveProfilePhoto(profile.id, photo);
        queryClient.setQueryData<ProfileRecordWithFields | null>(ownProfileQueryKey, (previous) =>
          previous?.id === profile.id ? { ...previous, avatar_url: key } : previous,
        );
        void queryClient.invalidateQueries({ queryKey: ownProfileQueryKey });
        void queryClient.invalidateQueries({ queryKey: ['person-cards'] });
        setSaved((count) => count + 1);
        setExpanded(false);
      },
      { code: 'UPLOAD-1' },
    );
    if (!result.ok) setFailure(result.error.code);
    working.current = false;
    setBusy(false);
  }

  function confirmRemove() {
    Alert.alert(t('photo.removeTitle'), t('photo.removeBody'), [
      { text: t('photo.cancel'), style: 'cancel' },
      { text: t('photo.remove'), style: 'destructive', onPress: () => void change('remove') },
    ]);
  }

  const portrait = (
    <PersonAvatar
      name={profile.first_name}
      avatarKey={profile.avatar_url}
      size="profile"
      fallback="person"
    />
  );
  const status = (
    <>
      {busy ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-form text-neutral-600 ${font}`}
        >
          {t('photo.saving')}
        </Text>
      ) : null}
      {cameraDenied ? (
        <View className="gap-sm">
          <Text
            accessibilityLiveRegion="polite"
            className={`text-start text-form text-neutral-800 ${font}`}
          >
            {t('photo.cameraDenied')}
          </Text>
          <AuthSubmitButton
            label={t('photo.settings')}
            onPress={() => {
              void safeAsync(() => Linking.openSettings()).then((result) => {
                if (!result.ok) setFailure(result.error.code);
              });
            }}
          />
        </View>
      ) : null}
      {failure ? <FailureNotice code={failure} message={t('photo.failed')} /> : null}
    </>
  );
  const editLabel = profile.avatar_url ? t('photo.change') : t('photo.add');
  // The way to change the photo (RAPP-888): a small pencil circle, a full
  // minimum tap target, named for screen readers by what it does.
  const pencil = (
    <PressableScale
      testID="profile-photo-edit"
      accessibilityLabel={editLabel}
      isDisabled={busy}
      onPress={() => setExpanded(true)}
      haptic="tapLight"
      className={`${badgeOnly ? '' : 'absolute '}items-center justify-center rounded-full border-2 border-white bg-primary`}
      style={badgeOnly ? EDIT_BADGE_ALONE_STYLE : EDIT_BADGE_STYLE}
    >
      <Icon name="pen" weight="linear" size={EDIT_ICON_SIZE} color={tokens.colors.white} />
    </PressableScale>
  );
  const sheet = (
    <AppSheet
      testID="profile-photo-sheet"
      title={editLabel}
      visible={expanded}
      onClose={() => setExpanded(false)}
    >
      <View className="gap-sm">
        <AuthSubmitButton
          label={t('photo.camera')}
          testID="profile-photo-camera"
          disabled={busy}
          onPress={() => void change('camera')}
        />
        <AuthSubmitButton
          label={t('photo.library')}
          testID="profile-photo-library"
          disabled={busy}
          onPress={() => void change('library')}
        />
        {profile.avatar_url ? (
          <PressableScale
            accessibilityLabel={t('photo.remove')}
            isDisabled={busy}
            onPress={confirmRemove}
            haptic="tapLight"
            className="min-h-recommended justify-center"
          >
            <Text className={`text-center text-form text-error ${font}`}>{t('photo.remove')}</Text>
          </PressableScale>
        ) : null}
        {status}
      </View>
    </AppSheet>
  );
  if (badgeOnly) {
    return (
      <>
        {pencil}
        {sheet}
      </>
    );
  }
  return (
    <View className="gap-md">
      <View className="flex-row items-center gap-md">
        <View>
          {saved > 0 ? <SuccessPop key={saved}>{portrait}</SuccessPop> : portrait}
          {pencil}
        </View>
        {beside === undefined ? null : <View className="flex-1">{beside}</View>}
      </View>
      {expanded ? null : status}
      {sheet}
    </View>
  );
}
