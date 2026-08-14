import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createVideoPlayer } from 'expo-video';
import { AppError } from '@ramassa/shared/errors';
import type { MediaItemInput, MediaPrivacy } from '@ramassa/shared/media';
import { MEDIA_CONSENT_VERSION } from '@ramassa/shared/media';
import { tokens } from '@ramassa/shared/tokens';
import { uploadFile, type UploadFileContent } from '@ramassa/shared/upload-client';
import type { MediaUploadDraft } from './media-upload-policy';
import { compressNativeStoryImage } from './native-image-compression';
import { prepareNativeGalleryVideo } from './native-media-upload';

const VIDEO_THUMBNAIL_TIME_SECONDS = 0;
const VIDEO_THUMBNAIL_JPEG_QUALITY = 0.72;
const UPLOAD_PROGRESS = {
  START: 0,
  PREPARATION_COMPLETE: 0.2,
  FILE_TRANSFER_WEIGHT: 0.5,
  THUMBNAIL_TRANSFER_START: 0.7,
  THUMBNAIL_TRANSFER_WEIGHT: 0.25,
  FINALIZING: 0.95,
} as const;

export interface GalleryUploadRequest {
  readonly draft: MediaUploadDraft;
  readonly caption: string;
  readonly privacyLevel: MediaPrivacy;
  readonly consentAcknowledged: boolean;
  readonly accessToken: string;
  readonly mediaWorkerUrl: string;
  readonly onProgress: (value: number) => void;
}

async function createVideoThumbnail(uri: string): Promise<UploadFileContent> {
  const player = createVideoPlayer(uri);
  try {
    const [thumbnail] = await player.generateThumbnailsAsync(VIDEO_THUMBNAIL_TIME_SECONDS, {
      maxWidth: tokens.upload.maxImageDimension,
      maxHeight: tokens.upload.maxImageDimension,
    });
    if (thumbnail === undefined) throw new AppError('UPLOAD-1');
    const context = ImageManipulator.manipulate(thumbnail);
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: VIDEO_THUMBNAIL_JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });
    const bytes = await new File(saved.uri).bytes();
    return { data: bytes, contentType: 'image/jpeg', byteLength: bytes.byteLength };
  } finally {
    player.release();
  }
}

export async function uploadGalleryMedia(request: GalleryUploadRequest): Promise<MediaItemInput> {
  if (!request.consentAcknowledged) throw new AppError('VALIDATION-1');
  request.onProgress(UPLOAD_PROGRESS.START);
  const file =
    request.draft.sourceKind === 'image'
      ? await compressNativeStoryImage({
          uri: request.draft.sourceUri,
          width: request.draft.width,
          height: request.draft.height,
        })
      : await prepareNativeGalleryVideo(request.draft);
  request.onProgress(UPLOAD_PROGRESS.PREPARATION_COMPLETE);

  const thumbnailPromise: Promise<UploadFileContent | null> =
    request.draft.sourceKind === 'video'
      ? createVideoThumbnail(request.draft.sourceUri)
      : Promise.resolve(null);
  const uploadedFilePromise = uploadFile({
    mediaWorkerUrl: request.mediaWorkerUrl,
    accessToken: request.accessToken,
    folder: 'gallery',
    file,
    onProgress: (value) =>
      request.onProgress(
        UPLOAD_PROGRESS.PREPARATION_COMPLETE + value * UPLOAD_PROGRESS.FILE_TRANSFER_WEIGHT,
      ),
  });
  const [uploadedFile, thumbnail] = await Promise.all([uploadedFilePromise, thumbnailPromise]);
  if (!uploadedFile.ok) throw uploadedFile.error;

  let thumbnailObjectKey: string | null =
    request.draft.sourceKind === 'image' ? uploadedFile.value.objectKey : null;
  if (thumbnail !== null) {
    const uploadedThumbnail = await uploadFile({
      mediaWorkerUrl: request.mediaWorkerUrl,
      accessToken: request.accessToken,
      folder: 'gallery',
      file: thumbnail,
      onProgress: (value) =>
        request.onProgress(
          UPLOAD_PROGRESS.THUMBNAIL_TRANSFER_START +
            value * UPLOAD_PROGRESS.THUMBNAIL_TRANSFER_WEIGHT,
        ),
    });
    if (!uploadedThumbnail.ok) throw uploadedThumbnail.error;
    thumbnailObjectKey = uploadedThumbnail.value.objectKey;
  }
  request.onProgress(UPLOAD_PROGRESS.FINALIZING);

  return {
    fileObjectKey: uploadedFile.value.objectKey,
    thumbnailObjectKey,
    fileType: request.draft.sourceKind,
    fileSize: file.byteLength,
    caption: request.caption,
    privacyLevel: request.privacyLevel,
    consentAcknowledged: true,
    consentVersion: MEDIA_CONSENT_VERSION,
  };
}
