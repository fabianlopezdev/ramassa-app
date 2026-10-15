/**
 * The organization's logo from the phone (RAPP-403): the picked image is
 * resized to 512 points wide at most and saved as PNG, so a transparent logo
 * keeps its transparency, then uploaded to the branding folder through the
 * media Worker. Returns the stored object key.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { AppError } from '@ramassa/shared/errors';
import { uploadFile } from '@ramassa/shared/upload-client';
import type { PickedPhoto } from './content-upload';
import { readFileBytes } from './read-file-bytes';
import { mobileClientEnv, supabase } from './supabase';

const LOGO_WIDTH = 512;

export async function uploadOrganizationLogo(photo: PickedPhoto): Promise<string> {
  const mediaWorkerUrl = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
  if (mediaWorkerUrl === undefined) throw new AppError('UPLOAD-1');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session === null) throw new AppError('AUTH-2');
  const context = ImageManipulator.manipulate(photo.uri);
  if (photo.width > LOGO_WIDTH) {
    context.resize({
      width: LOGO_WIDTH,
      height: Math.round((photo.height / photo.width) * LOGO_WIDTH),
    });
  }
  const image = await (await context.renderAsync()).saveAsync({ format: SaveFormat.PNG });
  const bytes = await readFileBytes(image.uri);
  const uploaded = await uploadFile({
    mediaWorkerUrl,
    accessToken: data.session.access_token,
    folder: 'organization-branding',
    file: { data: bytes, contentType: 'image/png', byteLength: bytes.byteLength },
  });
  if (!uploaded.ok) throw uploaded.error;
  return uploaded.value.objectKey;
}
