import { AppError } from '@ramassa/shared/errors';
import { createForumPost, type ForumPostInput } from '@ramassa/shared/forum';
import { uploadFile, type UploadFileOptions } from '@ramassa/shared/upload-client';
import type { CompressedNativeStoryImage } from './native-image-compression-core';

export function requireForumWriteOnline(isOnline: boolean): void {
  if (!isOnline) throw new AppError('NETWORK-1');
}

interface SubmitForumPostOptions {
  readonly isOnline: boolean;
  readonly accessToken: string | null;
  readonly mediaWorkerUrl: string | undefined;
  readonly categoryId: string;
  readonly content: string;
  readonly image: CompressedNativeStoryImage | null;
}

interface SubmitForumPostDependencies {
  readonly upload: typeof uploadFile;
  readonly createPost: (client: ForumClient, input: ForumPostInput) => Promise<string>;
}

type ForumClient = Parameters<typeof createForumPost>[0];

const defaultDependencies: SubmitForumPostDependencies = {
  upload: uploadFile,
  createPost: createForumPost,
};

export async function submitForumPostWithDependencies(
  client: ForumClient,
  options: SubmitForumPostOptions,
  dependencies: SubmitForumPostDependencies = defaultDependencies,
): Promise<string> {
  requireForumWriteOnline(options.isOnline);
  if (options.accessToken === null) throw new AppError('AUTH-2');
  if (options.image !== null && options.mediaWorkerUrl === undefined) {
    throw new AppError('UPLOAD-1');
  }

  let imageObjectKey: string | null = null;
  if (options.image !== null) {
    const uploadOptions: UploadFileOptions = {
      mediaWorkerUrl: options.mediaWorkerUrl!,
      accessToken: options.accessToken,
      folder: 'forum',
      file: options.image,
    };
    const uploaded = await dependencies.upload(uploadOptions);
    if (!uploaded.ok) throw uploaded.error;
    imageObjectKey = uploaded.value.objectKey;
  }

  return dependencies.createPost(client, {
    categoryId: options.categoryId,
    content: options.content,
    imageObjectKey,
  });
}
