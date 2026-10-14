/**
 * A photo for staff content (RAPP-341 announcements, RAPP-343 knowledge
 * steps), compressed on the phone and uploaded to its media folder at save.
 * Returns the stored object key.
 */
import { AppError } from '@ramassa/shared/errors';
import type { UploadFolder } from '@ramassa/shared/schemas';
import { uploadFile } from '@ramassa/shared/upload-client';
import { compressNativeStoryImage } from './native-image-compression';
import { mobileClientEnv, supabase } from './supabase';

export interface PickedPhoto {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export async function uploadContentImage(
  folder: UploadFolder,
  photo: PickedPhoto,
): Promise<string> {
  const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
  if (mediaWorkerUrl === undefined) throw new AppError('UPLOAD-1');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session === null) throw new AppError('AUTH-2');
  const image = await compressNativeStoryImage(photo);
  const uploaded = await uploadFile({
    mediaWorkerUrl,
    accessToken: data.session.access_token,
    folder,
    file: image,
  });
  if (!uploaded.ok) throw uploaded.error;
  return uploaded.value.objectKey;
}
