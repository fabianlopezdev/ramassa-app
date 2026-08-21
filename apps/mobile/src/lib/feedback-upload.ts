import { uploadFile } from '@ramassa/shared/upload-client';
import { compressNativeStoryImage } from './native-image-compression';

export interface FeedbackImageDraft {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

export async function uploadFeedbackImage(options: {
  readonly draft: FeedbackImageDraft;
  readonly accessToken: string;
  readonly mediaWorkerUrl: string;
}): Promise<string> {
  const image = await compressNativeStoryImage({
    uri: options.draft.uri,
    width: options.draft.width,
    height: options.draft.height,
  });
  const uploaded = await uploadFile({
    mediaWorkerUrl: options.mediaWorkerUrl,
    accessToken: options.accessToken,
    folder: 'feedback',
    file: image,
  });
  if (!uploaded.ok) throw uploaded.error;
  return uploaded.value.objectKey;
}
