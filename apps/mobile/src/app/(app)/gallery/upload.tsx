import { AuthTextField } from '@/components/auth/auth-text-field';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { uploadGalleryMedia } from '@/lib/gallery-upload';
import {
  initialMediaUploadState,
  mediaUploadReducer,
  type MediaUploadDraft,
} from '@/lib/media-upload-policy';
import { useCreateGalleryItem } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import type { MediaPrivacy } from '@ramassa/shared/media';
import { uploadContentTypeSchema } from '@ramassa/shared/schemas';

export default function GalleryUploadScreen() {
  const { t } = useTranslation(['gallery', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { back, replace } = useRouter();
  const { session } = useAuth();
  const createItem = useCreateGalleryItem();
  const [state, dispatch] = useReducer(mediaUploadReducer, initialMediaUploadState);
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<MediaPrivacy>('community');
  const [consent, setConsent] = useState(false);

  const pick = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: false,
      quality: 1,
      videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
    });
    if (result.canceled || result.assets[0] === undefined) return;
    const asset = result.assets[0];
    const fallbackMime = asset.type === 'video' ? 'video/mp4' : 'image/jpeg';
    const parsedMime = uploadContentTypeSchema.safeParse(asset.mimeType ?? fallbackMime);
    if (!parsedMime.success) {
      dispatch({ type: 'failed', errorCode: 'UPLOAD-2' });
      return;
    }
    const draft: MediaUploadDraft = {
      sourceUri: asset.uri,
      sourceKind: asset.type === 'video' ? 'video' : 'image',
      mimeType: parsedMime.data,
      width: asset.width,
      height: asset.height,
      pickerFileSize: asset.fileSize ?? null,
    };
    dispatch({ type: 'selected', draft });
  }, []);

  const submit = useCallback(async () => {
    if (
      state.draft === null ||
      !consent ||
      session === null ||
      mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL === undefined
    ) {
      dispatch({ type: 'failed', errorCode: consent ? 'AUTH-2' : 'VALIDATION-1' });
      return;
    }
    dispatch({ type: 'started' });
    try {
      const input = await uploadGalleryMedia({
        draft: state.draft,
        caption,
        privacyLevel: privacy,
        consentAcknowledged: consent,
        accessToken: session.access_token,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        onProgress: (value) => dispatch({ type: 'progress', value }),
      });
      const mediaItemId = await createItem.mutateAsync(input);
      dispatch({ type: 'completed' });
      replace(`/gallery/${mediaItemId}` as Href);
    } catch (error) {
      dispatch({ type: 'failed', errorCode: toAppError(error, 'UPLOAD-1').code });
    }
  }, [caption, consent, createItem, privacy, replace, session, state.draft]);

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="grow px-lg py-lg">
      <FormWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('common:back')}
          onPress={back}
          className="min-h-recommended self-start justify-center rounded-full border border-neutral-300 px-lg"
        >
          <Text className={`font-medium text-primary ${languageFontClass}`}>
            {t('common:back')}
          </Text>
        </PressableScale>
        <Text
          accessibilityRole="header"
          className={`text-start text-3xl font-bold ${languageFontClass}`}
        >
          {t('gallery:uploadTitle')}
        </Text>
        <PressableScale
          testID="gallery-pick-media"
          accessibilityLabel={t('gallery:pickMedia')}
          onPress={() => void pick()}
          haptic="tapLight"
          className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
        >
          <Text className={`font-bold text-primary ${languageFontClass}`}>
            {state.draft === null ? t('gallery:pickMedia') : t('gallery:changeMedia')}
          </Text>
        </PressableScale>
        <AuthTextField
          label={t('gallery:caption')}
          value={caption}
          onChangeText={setCaption}
          maxLength={500}
          multiline
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('gallery:privacy')}
          className="gap-sm"
        >
          {(['community', 'staff_only'] as const).map((value) => (
            <PressableScale
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={t(`gallery:privacyLevels.${value}`)}
              isSelected={privacy === value}
              onPress={() => setPrivacy(value)}
              className={`min-h-recommended justify-center rounded-md border px-lg ${privacy === value ? 'border-primary bg-primary' : 'border-neutral-300'}`}
            >
              <Text
                className={`${privacy === value ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
              >
                {t(`gallery:privacyLevels.${value}`)}
              </Text>
            </PressableScale>
          ))}
        </View>
        <View className="flex-row items-center gap-md">
          <Switch
            testID="gallery-consent-acknowledgment"
            value={consent}
            onValueChange={setConsent}
            accessibilityLabel={t('gallery:consentReminder')}
          />
          <Text className={`flex-1 text-start text-md text-neutral-700 ${languageFontClass}`}>
            {t('gallery:consentReminder')}
          </Text>
        </View>
        {state.status === 'uploading' ? (
          <View
            testID="gallery-upload-progress"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(state.progress * 100) }}
            className="gap-xs"
          >
            <Text className={`text-start text-sm text-neutral-700 ${languageFontClass}`}>
              {t('gallery:uploadProgress', { percent: Math.round(state.progress * 100) })}
            </Text>
            <View className="h-xs overflow-hidden rounded-full bg-neutral-200">
              <View
                className="h-full bg-primary"
                style={{ width: `${Math.round(state.progress * 100)}%` }}
              />
            </View>
          </View>
        ) : null}
        {state.status === 'failed' ? (
          <View className="gap-sm">
            <Text
              accessibilityRole="alert"
              className={`text-start text-error ${languageFontClass}`}
            >
              {state.errorCode === 'VALIDATION-1'
                ? t('gallery:consentRequired')
                : t('gallery:uploadFailed')}
            </Text>
            <PressableScale
              testID="gallery-upload-retry"
              accessibilityLabel={t('gallery:retry')}
              onPress={() => {
                dispatch({ type: 'retry' });
                void submit();
              }}
              className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
            >
              <Text className={`font-bold text-primary ${languageFontClass}`}>
                {t('gallery:retry')}
              </Text>
            </PressableScale>
          </View>
        ) : null}
        <PressableScale
          testID="gallery-upload-submit"
          accessibilityLabel={t('gallery:publish')}
          onPress={() => void submit()}
          isBusy={state.status === 'uploading'}
          isDisabled={state.draft === null || !consent}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`font-bold text-white ${languageFontClass}`}>
            {t('gallery:publish')}
          </Text>
        </PressableScale>
      </FormWidth>
    </ScrollView>
  );
}
