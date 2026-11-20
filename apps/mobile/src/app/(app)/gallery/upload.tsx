import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { FormWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { ScreenSection } from '@/components/layout/screen-section';
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
import { Platform, ScrollView, StyleSheet, Switch, Text, View, type TextStyle } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';
import { toAppError } from '@ramassa/shared/errors';
import { MEDIA_CAPTION_MAX_LENGTH, type MediaPrivacy } from '@ramassa/shared/media';
import { uploadContentTypeSchema } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const IMAGE_PICKER_ORIGINAL_QUALITY = 1;
const PROGRESS_PERCENT_MIN = 0;
const PROGRESS_PERCENT_MAX = 100;
const GALLERY_UPLOAD_PREVIEW_ASPECT_RATIO = 4 / 3;
const MEDIA_PRIVACY_OPTIONS: readonly MediaPrivacy[] = ['community', 'staff_only'];
const IOS_SWITCH_VISUAL_HEIGHT = 28;
const IOS_SWITCH_SCALE = tokens.tapTarget.min / IOS_SWITCH_VISUAL_HEIGHT;
const uncheckedSwitchAccessibilityState = { checked: false } as const;
const checkedSwitchAccessibilityState = { checked: true } as const;
const consentSwitchRole = Platform.OS === 'web' ? 'none' : 'switch';
const mixedDirectionInputStyle: TextStyle = { writingDirection: 'auto' };
const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: GALLERY_UPLOAD_PREVIEW_ASPECT_RATIO },
  consentSwitch: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tapTarget.min,
    minWidth: tokens.tapTarget.min,
    transform: Platform.OS === 'ios' ? [{ scale: IOS_SWITCH_SCALE }] : undefined,
  },
});

export default function GalleryUploadScreen() {
  const { t } = useTranslation(['gallery', 'common']);
  const languageFontClass = useLanguageFontClass();
  const { replace } = useRouter();
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

  const toggleConsent = useCallback(() => {
    playHaptic('selection');
    setConsent((current) => !current);
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
    <>
      <NativeScreenHeader surface="white" title={t('gallery:uploadTitle')} />
      <ScrollView
        className="flex-1 bg-white"
        contentContainerClassName="grow px-lg py-lg"
        contentInsetAdjustmentBehavior="automatic"
      >
        <FormWidth className="gap-lg">
          {selectedDraft === null ? (
            <RaisedActionButton
              testID="gallery-pick-media"
              label={t('gallery:pickMedia')}
              onPress={pick}
            />
          ) : (
            <ScreenSection
              testID="gallery-selected-media-preview"
              title={t('gallery:selectedMediaPreview')}
            >
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
                <View className="flex-1">
                  <RaisedActionButton
                    testID="gallery-change-media"
                    label={t('gallery:changeMedia')}
                    onPress={pick}
                  />
                </View>
                <View className="flex-1">
                  <RaisedActionButton
                    testID="gallery-remove-media"
                    tone="danger"
                    label={t('gallery:removeMedia')}
                    onPress={removeSelectedMedia}
                  />
                </View>
              </View>
            </ScreenSection>
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
              <AuthSubmitButton
                testID="gallery-open-settings"
                label={t('gallery:openSettings')}
                onPress={openSettings}
              />
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
              style={styles.consentSwitch}
              value={consent}
              onValueChange={toggleConsent}
              accessibilityRole={consentSwitchRole}
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
                <RaisedActionButton
                  testID="gallery-upload-retry"
                  label={t('gallery:retry')}
                  onPress={retry}
                />
              )}
            </View>
          ) : null}
          <AuthSubmitButton
            testID="gallery-upload-submit"
            label={t('gallery:publish')}
            onPress={submit}
            isLoading={state.status === 'uploading'}
            disabled={state.draft === null || !consent}
          />
        </FormWidth>
      </ScrollView>
    </>
  );
}
