import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createVideoPlayer } from 'expo-video';
import { AppError } from '@ramassa/shared/errors';
import type { MediaItemInput, MediaPrivacy } from '@ramassa/shared/media';
import { MEDIA_CONSENT_VERSION } from '@ramassa/shared/media';
import { uploadFile, type UploadFileContent } from '@ramassa/shared/upload-client';
import type { MediaUploadDraft } from './media-upload-policy';
import { compressNativeStoryImage } from './native-image-compression';
import { prepareNativeGalleryVideo } from './native-media-upload';

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
    const [thumbnail] = await player.generateThumbnailsAsync(0, {
      maxWidth: 1_200,
      maxHeight: 1_200,
    });
    if (thumbnail === undefined) throw new AppError('UPLOAD-1');
    const context = ImageManipulator.manipulate(thumbnail);
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
    const bytes = await new File(saved.uri).bytes();
    return { data: bytes, contentType: 'image/jpeg', byteLength: bytes.byteLength };
  } finally {
    player.release();
  }
}

export async function uploadGalleryMedia(request: GalleryUploadRequest): Promise<MediaItemInput> {
  if (!request.consentAcknowledged) throw new AppError('VALIDATION-1');
  request.onProgress(0);
  const file =
    request.draft.sourceKind === 'image'
      ? await compressNativeStoryImage({
          uri: request.draft.sourceUri,
          width: request.draft.width,
          height: request.draft.height,
        })
      : await prepareNativeGalleryVideo(request.draft);
  request.onProgress(0.2);

  const uploadedFile = await uploadFile({
    mediaWorkerUrl: request.mediaWorkerUrl,
    accessToken: request.accessToken,
    folder: 'gallery',
    file,
    onProgress: (value) => request.onProgress(0.2 + value * 0.5),
  });
  if (!uploadedFile.ok) throw uploadedFile.error;

  let thumbnailObjectKey: string | null =
    request.draft.sourceKind === 'image' ? uploadedFile.value.objectKey : null;
  if (request.draft.sourceKind === 'video') {
    const thumbnail = await createVideoThumbnail(request.draft.sourceUri);
    const uploadedThumbnail = await uploadFile({
      mediaWorkerUrl: request.mediaWorkerUrl,
      accessToken: request.accessToken,
      folder: 'gallery',
      file: thumbnail,
      onProgress: (value) => request.onProgress(0.7 + value * 0.25),
    });
    if (!uploadedThumbnail.ok) throw uploadedThumbnail.error;
    thumbnailObjectKey = uploadedThumbnail.value.objectKey;
  }
  request.onProgress(0.95);

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
