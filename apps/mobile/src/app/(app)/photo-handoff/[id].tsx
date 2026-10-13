/**
 * A photo the desk asked for (RAPP-254), opened from the QR code's web page
 * or a `ramassa://photo-handoff/<id>` link. Signed in as the person who asked,
 * it takes or chooses the photo, uploads it to the documents folder and
 * completes the handoff; the desk sees it arrive. Anyone else, an expired code
 * or a used one gets a plain sentence and no camera.
 */
import { FailureNotice } from '@/components/error-code-line';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { compressNativeStoryImage } from '@/lib/native-image-compression';
import { mobileClientEnv, supabase } from '@/lib/supabase';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import { AppError, toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  completePhotoHandoff,
  fetchPhotoHandoff,
  photoHandoffState,
} from '@ramassa/shared/photo-handoff';
import { tokens } from '@ramassa/shared/tokens';
import { uploadFile } from '@ramassa/shared/upload-client';

export default function PhotoHandoffScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { user, session } = useAuth();
  const handoff = useQuery({
    queryKey: ['photo-handoff', user?.id ?? 'signed-out', id],
    queryFn: () => fetchPhotoHandoff(supabase, id),
    enabled: user !== null && id.length > 0,
    // Short-lived and changed elsewhere: always read it fresh.
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [denied, setDenied] = useState(false);

  const state =
    handoff.data === undefined
      ? null
      : handoff.data === null
        ? 'missing'
        : photoHandoffState(handoff.data);

  const take = async (from: 'camera' | 'library') => {
    setErrorCode(null);
    setDenied(false);
    if (from === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setDenied(true);
        return;
      }
    }
    const options = { mediaTypes: ['images' as const], quality: 1 };
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return;
    setStatus('sending');
    try {
      const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
      if (mediaWorkerUrl === undefined || session === null) throw new AppError('UPLOAD-1');
      const image = await compressNativeStoryImage({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
      const uploaded = await uploadFile({
        mediaWorkerUrl,
        accessToken: session.access_token,
        folder: 'documents',
        file: image,
      });
      if (!uploaded.ok) throw uploaded.error;
      await completePhotoHandoff(supabase, {
        id,
        objectKey: uploaded.value.objectKey,
        contentType: image.contentType,
        fileSize: image.byteLength,
      });
      setStatus('sent');
    } catch (error) {
      setStatus('idle');
      setErrorCode(toAppError(error).code);
    }
  };

  const button = (label: string, onPress: () => void, testID: string, primary: boolean) => (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isBusy={status === 'sending'}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md px-lg ${
        primary ? 'bg-primary' : 'border border-primary'
      }`}
    >
      <Text
        className={`text-center text-md font-bold ${primary ? 'text-white' : 'text-primary-dark'} ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );

  const sentence = (text: string, testID?: string) => (
    <Text
      testID={testID}
      accessibilityRole="alert"
      className={`text-start text-md text-neutral-800 ${fontClass}`}
    >
      {text}
    </Text>
  );

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="photo-handoff-back"
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
            className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('handoff.pageTitle')}
          </Text>
          {handoff.isPending ? <ActivityIndicator color={tokens.colors.primary.DEFAULT} /> : null}
          {state === 'missing' ? sentence(t('handoff.notFound')) : null}
          {state === 'expired' ? sentence(t('handoff.pageExpired')) : null}
          {state === 'done' && status !== 'sent' ? sentence(t('handoff.pageUsed')) : null}
          {status === 'sent' ? sentence(t('handoff.sent'), 'photo-handoff-sent') : null}
          {state === 'open' && handoff.data != null && status !== 'sent' ? (
            <View className="gap-md">
              <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
                {t('handoff.pageIntro', { name: handoff.data.documentName })}
              </Text>
              {button(
                t('handoff.takePhoto'),
                () => void take('camera'),
                'photo-handoff-camera',
                true,
              )}
              {button(
                t('handoff.choosePhoto'),
                () => void take('library'),
                'photo-handoff-library',
                false,
              )}
              {status === 'sending' ? (
                <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                  {t('handoff.uploading')}
                </Text>
              ) : null}
              {denied ? sentence(t('handoff.cameraDenied')) : null}
              {errorCode === null ? null : (
                <FailureNotice code={errorCode} message={t('handoff.sendFailed')} />
              )}
            </View>
          ) : null}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
