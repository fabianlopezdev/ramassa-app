/**
 * A file she gives in answer to a staff question (RAPP-610). It goes through
 * the same media pipeline as her feedback photo (RAPP-14): a photo is
 * compressed on the phone first (ADR-013), a PDF is sent as it is, and the
 * media Worker writes it to her own private folder (`intake-answers`). The
 * answer keeps the key, a display name, the type and the size; the database
 * checks the key is in her folder.
 *
 * A build made without the media service (hosted staging today) has no
 * upload: `uploadsAvailable` is false and the field says so instead.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { AppError } from '@ramassa/shared/errors';
import {
  FILE_MAX_BYTES,
  FILE_NAME_MAX_LENGTH,
  uploadsAvailable,
  type FileAnswer,
} from '@ramassa/shared/intake-builder';
import { uploadFile } from '@ramassa/shared/upload-client';
import { compressNativeStoryImage } from './native-image-compression';
import { readFileBytes } from './read-file-bytes';
import { mobileClientEnv, supabase } from './supabase';

const IMAGE_PICKER_ORIGINAL_QUALITY = 1;

export function answerUploadsAvailable(): boolean {
  return uploadsAvailable(mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL);
}

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session === null) throw new AppError('AUTH-2');
  return data.session.access_token;
}

function mediaWorkerUrl(): string {
  const url = mobileClientEnv.EXPO_PUBLIC_MEDIA_WORKER_URL;
  if (!uploadsAvailable(url)) throw new AppError('UPLOAD-1');
  return url!;
}

function displayName(name: string | null | undefined, fallback: string): string {
  const trimmed = (name ?? '').trim();
  return (trimmed === '' ? fallback : trimmed).slice(0, FILE_NAME_MAX_LENGTH);
}

/** A photo from her library, compressed and uploaded. Null when she closes the picker. */
export async function pickAndUploadAnswerPhoto(): Promise<FileAnswer | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: IMAGE_PICKER_ORIGINAL_QUALITY,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return null;
  const image = await compressNativeStoryImage({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  });
  const uploaded = await uploadFile({
    mediaWorkerUrl: mediaWorkerUrl(),
    accessToken: await accessToken(),
    folder: 'intake-answers',
    file: image,
  });
  if (!uploaded.ok) throw uploaded.error;
  return {
    key: uploaded.value.objectKey,
    name: displayName(asset.fileName, 'photo.jpg'),
    content_type: image.contentType,
    size: image.byteLength,
  };
}

/** A PDF from her files, uploaded as it is. Null when she closes the picker. */
export async function pickAndUploadAnswerDocument(): Promise<FileAnswer | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf'],
    copyToCacheDirectory: true,
  });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (asset === undefined) return null;
  const bytes = await readFileBytes(asset.uri);
  if (bytes.byteLength > FILE_MAX_BYTES) throw new AppError('UPLOAD-3');
  const uploaded = await uploadFile({
    mediaWorkerUrl: mediaWorkerUrl(),
    accessToken: await accessToken(),
    folder: 'intake-answers',
    file: { data: bytes, contentType: 'application/pdf', byteLength: bytes.byteLength },
  });
  if (!uploaded.ok) throw uploaded.error;
  return {
    key: uploaded.value.objectKey,
    name: displayName(asset.name, 'document.pdf'),
    content_type: 'application/pdf',
    size: bytes.byteLength,
  };
}
