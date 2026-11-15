import type { ImagePickerAsset } from 'expo-image-picker';
import { AppError } from '@ramassa/shared/errors';
import { setOwnProfilePhoto } from '@ramassa/shared/profile';
import { uploadFile } from '@ramassa/shared/upload-client';
import { compressNativeStoryImage } from './native-image-compression';
import { mobileClientEnv, supabase } from './supabase';

export async function saveProfilePhoto(
  profileId: string,
  photo: ImagePickerAsset | null,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== profileId) throw new AppError('AUTH-2');
  let objectKey: string | null = null;
  if (photo !== null) {
    const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
    if (!mediaWorkerUrl) throw new AppError('UPLOAD-1');
    const image = await compressNativeStoryImage(photo);
    const uploaded = await uploadFile({
      mediaWorkerUrl,
      accessToken: data.session.access_token,
      folder: 'profile-photos',
      file: image,
    });
    if (!uploaded.ok) throw uploaded.error;
    objectKey = uploaded.value.objectKey;
  }
  const current = await supabase.auth.getSession();
  if (current.error || current.data.session?.user.id !== profileId) throw new AppError('AUTH-2');
  await setOwnProfilePhoto(supabase, profileId, objectKey);
  return objectKey;
}
