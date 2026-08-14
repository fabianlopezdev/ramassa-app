import { AuthTextField } from '@/components/auth/auth-text-field';
import { ErrorCodeLine } from '@/components/error-code-line';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { uploadGalleryMedia } from '@/lib/gallery-upload';
import { playHaptic } from '@/lib/haptics/haptics';
import {
  initialMediaUploadState,
  mediaUploadReducer,
  requireGalleryWriteOnline,
  type MediaUploadDraft,
} from '@/lib/media-upload-policy';
import { isNetworkStateOnline } from '@/lib/network-status';
import { useCreateGalleryItem } from '@/lib/player-gallery';
import { mobileClientEnv } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useNetworkState } from 'expo-network';
import { useRouter, type Href } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useMemo, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, Text, View, type TextStyle } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import { MEDIA_CAPTION_MAX_LENGTH, type MediaPrivacy } from '@ramassa/shared/media';
import { uploadContentTypeSchema } from '@ramassa/shared/schemas';

const IMAGE_PICKER_ORIGINAL_QUALITY = 1;
const PROGRESS_PERCENT_MIN = 0;
const PROGRESS_PERCENT_MAX = 100;
const GALLERY_UPLOAD_PREVIEW_ASPECT_RATIO = 4 / 3;
const MEDIA_PRIVACY_OPTIONS: readonly MediaPrivacy[] = ['community', 'staff_only'];
const uncheckedSwitchAccessibilityState = { checked: false } as const;
const checkedSwitchAccessibilityState = { checked: true } as const;
const mixedDirectionInputStyle: TextStyle = { writingDirection: 'auto' };
const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: GALLERY_UPLOAD_PREVIEW_ASPECT_RATIO },
});

export default function GalleryUploadScreen() {
  const { t } = useTranslation(['gallery', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { back, replace } = useRouter();
  const { session } = useAuth();
  const networkState = useNetworkState();
  const isOnline = isNetworkStateOnline(networkState);
  const createItem = useCreateGalleryItem();
  const createGalleryItem = createItem.mutateAsync;
  const [state, dispatch] = useReducer(mediaUploadReducer, initialMediaUploadState);
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<MediaPrivacy>('community');
  const [consent, setConsent] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const selectedDraft = state.draft;
  const selectedImageSource = useMemo(
    () => (selectedDraft?.sourceKind === 'image' ? { uri: selectedDraft.sourceUri } : null),
    [selectedDraft],
  );
  const selectedVideoSource =
    selectedDraft?.sourceKind === 'video' ? selectedDraft.sourceUri : null;
  const previewVideoPlayer = useVideoPlayer(selectedVideoSource);
  const privacyActions = useMemo<Record<MediaPrivacy, () => void>>(
    () => ({
      community: () => setPrivacy('community'),
      staff_only: () => setPrivacy('staff_only'),
    }),
    [],
  );
  const progressPercent = Math.round(state.progress * PROGRESS_PERCENT_MAX);
  const uploadProgressLabel = t('gallery:uploadProgress', { percent: progressPercent });
  const uploadProgressAccessibilityValue = useMemo(
    () => ({ min: PROGRESS_PERCENT_MIN, max: PROGRESS_PERCENT_MAX, now: progressPercent }),
    [progressPercent],
  );
  const uploadProgressStyle = useMemo(
    () => ({ width: `${progressPercent}%` as const }),
    [progressPercent],
  );
  const renderPrivacyOption = useCallback(
    (value: MediaPrivacy) => (
      <PressableScale
        key={value}
        accessibilityRole="radio"
        accessibilityLabel={t(`gallery:privacyLevels.${value}`)}
        isSelected={privacy === value}
        onPress={privacyActions[value]}
        haptic="selection"
        style={continuousCorners}
        className={`min-h-recommended justify-center rounded-md border px-lg ${privacy === value ? 'border-primary bg-primary' : 'border-neutral-300'}`}
      >
        <Text
          className={`${privacy === value ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
        >
          {t(`gallery:privacyLevels.${value}`)}
        </Text>
      </PressableScale>
    ),
    [languageFontClass, privacy, privacyActions, t],
  );

  const toggleConsent = useCallback((value: boolean) => {
    playHaptic('selection');
    setConsent(value);
  }, []);

  const pick = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: false,
      quality: IMAGE_PICKER_ORIGINAL_QUALITY,
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
  const removeSelectedMedia = useCallback(() => {
    dispatch({ type: 'reset' });
    setConsent(false);
  }, []);
  const openSettings = useCallback(() => {
    void Linking.openSettings();
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
    try {
      requireGalleryWriteOnline(isOnline);
      dispatch({ type: 'started' });
      const input = await uploadGalleryMedia({
        draft: state.draft,
        caption,
        privacyLevel: privacy,
        consentAcknowledged: consent,
        accessToken: session.access_token,
        mediaWorkerUrl: mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL,
        onProgress: (value) => dispatch({ type: 'progress', value }),
      });
      const mediaItemId = await createGalleryItem(input);
      dispatch({ type: 'completed' });
      replace(`/gallery/${mediaItemId}` as Href);
    } catch (error) {
      dispatch({ type: 'failed', errorCode: toAppError(error, 'UPLOAD-1').code });
    }
  }, [caption, consent, createGalleryItem, isOnline, privacy, replace, session, state.draft]);
  const retry = useCallback(() => {
    dispatch({ type: 'retry' });
    void submit();
  }, [submit]);

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="grow px-lg py-lg"
      contentInsetAdjustmentBehavior="automatic"
    >
      <FormWidth className="gap-lg">
        <PressableScale
          accessibilityLabel={t('common:back')}
          onPress={back}
          haptic="tapLight"
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
        {selectedDraft === null ? (
          <PressableScale
            testID="gallery-pick-media"
            accessibilityLabel={t('gallery:pickMedia')}
            onPress={pick}
            haptic="tapLight"
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
          >
            <Text className={`font-bold text-primary ${languageFontClass}`}>
              {t('gallery:pickMedia')}
            </Text>
          </PressableScale>
        ) : (
          <View testID="gallery-selected-media-preview" className="gap-sm">
            <Text
              accessibilityRole="header"
              className={`text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('gallery:selectedMediaPreview')}
            </Text>
            {selectedDraft.sourceKind === 'video' ? (
              <VideoView
                player={previewVideoPlayer}
                nativeControls
                accessibilityLabel={t('gallery:selectedVideoPreview')}
                contentFit="contain"
                style={styles.preview}
              />
            ) : selectedImageSource === null ? null : (
              <Image
                source={selectedImageSource}
                accessibilityLabel={t('gallery:selectedPhotoPreview')}
                contentFit="contain"
                style={styles.preview}
                className="rounded-md bg-neutral-100"
              />
            )}
            <View className="flex-row gap-sm">
              <PressableScale
                testID="gallery-change-media"
                accessibilityLabel={t('gallery:changeMedia')}
                onPress={pick}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended grow items-center justify-center rounded-md border border-primary px-md"
              >
                <Text className={`font-bold text-primary ${languageFontClass}`}>
                  {t('gallery:changeMedia')}
                </Text>
              </PressableScale>
              <PressableScale
                testID="gallery-remove-media"
                accessibilityLabel={t('gallery:removeMedia')}
                onPress={removeSelectedMedia}
                haptic="warning"
                style={continuousCorners}
                className="min-h-recommended grow items-center justify-center rounded-md border border-error px-md"
              >
                <Text className={`font-bold text-error ${languageFontClass}`}>
                  {t('gallery:removeMedia')}
                </Text>
              </PressableScale>
            </View>
          </View>
        )}
        {permissionDenied ? (
          <View testID="gallery-media-permission-error" className="gap-sm">
            <Text
              selectable
              accessibilityRole="alert"
              className={`text-start text-md text-error ${languageFontClass}`}
            >
              {t('gallery:mediaPermissionDenied')}
            </Text>
            <ErrorCodeLine code="UPLOAD-2" />
            <PressableScale
              testID="gallery-open-settings"
              accessibilityLabel={t('gallery:openSettings')}
              onPress={openSettings}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`font-bold text-white ${languageFontClass}`}>
                {t('gallery:openSettings')}
              </Text>
            </PressableScale>
          </View>
        ) : null}
        <AuthTextField
          label={t('gallery:caption')}
          value={caption}
          onChangeText={setCaption}
          maxLength={MEDIA_CAPTION_MAX_LENGTH}
          multiline
          style={mixedDirectionInputStyle}
        />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('gallery:privacy')}
          className="gap-sm"
        >
          {MEDIA_PRIVACY_OPTIONS.map(renderPrivacyOption)}
        </View>
        <View className="flex-row items-center gap-md">
          <Switch
            testID="gallery-consent-acknowledgment"
            value={consent}
            onValueChange={toggleConsent}
            accessibilityRole="switch"
            accessibilityLabel={t('gallery:consentReminder')}
            accessibilityState={
              consent ? checkedSwitchAccessibilityState : uncheckedSwitchAccessibilityState
            }
          />
          <Text className={`flex-1 text-start text-md text-neutral-700 ${languageFontClass}`}>
            {t('gallery:consentReminder')}
          </Text>
        </View>
        {state.status === 'uploading' ? (
          <View
            testID="gallery-upload-progress"
            accessibilityRole="progressbar"
            accessibilityLabel={uploadProgressLabel}
            accessibilityValue={uploadProgressAccessibilityValue}
            className="gap-xs"
          >
            <Text
              className={`text-start text-sm tabular-nums text-neutral-700 ${languageFontClass}`}
            >
              {uploadProgressLabel}
            </Text>
            <View className="h-xs overflow-hidden rounded-full bg-neutral-200">
              <View className="h-full bg-primary" style={uploadProgressStyle} />
            </View>
          </View>
        ) : null}
        {state.status === 'failed' ? (
          <View className="gap-sm">
            <Text
              selectable
              accessibilityRole="alert"
              className={`text-start text-error ${languageFontClass}`}
            >
              {state.errorCode === 'VALIDATION-1'
                ? t('gallery:consentRequired')
                : t('gallery:uploadFailed')}
            </Text>
            {state.draft === null ? null : (
              <PressableScale
                testID="gallery-upload-retry"
                accessibilityLabel={t('gallery:retry')}
                onPress={retry}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-primary px-lg"
              >
                <Text className={`font-bold text-primary ${languageFontClass}`}>
                  {t('gallery:retry')}
                </Text>
              </PressableScale>
            )}
          </View>
        ) : null}
        <PressableScale
          testID="gallery-upload-submit"
          accessibilityLabel={t('gallery:publish')}
          onPress={submit}
          haptic="tapLight"
          isBusy={state.status === 'uploading'}
          isDisabled={state.draft === null || !consent}
          style={continuousCorners}
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
