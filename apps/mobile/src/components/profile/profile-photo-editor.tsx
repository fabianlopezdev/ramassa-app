import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { SuccessPop } from '@/components/motion/success-pop';
import { PersonAvatar } from '@/components/people/person-avatar';
import { safeAsync } from '@/lib/observability';
import { saveProfilePhoto } from '@/lib/profile-photo';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Text, View } from 'react-native';
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import { ownProfileQueryKey } from '@ramassa/shared/profile';
import type { ProfileRecordWithFields } from '@ramassa/shared/schemas';

const PHOTO_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 1,
  exif: false,
};

export function ProfilePhotoEditor({ profile }: { readonly profile: ProfileRecordWithFields }) {
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
    <PersonAvatar name={profile.first_name} avatarKey={profile.avatar_url} size="profile" />
  );
  return (
    <View className="gap-md">
      <View className="flex-row items-center gap-lg">
        {saved > 0 ? <SuccessPop key={saved}>{portrait}</SuccessPop> : portrait}
        <View className="flex-1">
          <PressableScale
            testID="profile-photo-edit"
            accessibilityLabel={profile.avatar_url ? t('photo.change') : t('photo.add')}
            haptic="tapLight"
            isDisabled={busy}
            onPress={() => setExpanded((value) => !value)}
            className="min-h-recommended justify-center rounded-md border border-primary px-md"
          >
            <Text className={`text-center text-form font-bold text-primary ${font}`}>
              {profile.avatar_url ? t('photo.change') : t('photo.add')}
            </Text>
          </PressableScale>
        </View>
      </View>
      {expanded ? (
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
              <Text className={`text-center text-form text-error ${font}`}>
                {t('photo.remove')}
              </Text>
            </PressableScale>
          ) : null}
          <PressableScale
            accessibilityLabel={t('photo.cancel')}
            isDisabled={busy}
            onPress={() => setExpanded(false)}
            haptic="tapLight"
            className="min-h-recommended justify-center"
          >
            <Text className={`text-center text-form text-neutral-600 ${font}`}>
              {t('photo.cancel')}
            </Text>
          </PressableScale>
        </View>
      ) : null}
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
    </View>
  );
}
