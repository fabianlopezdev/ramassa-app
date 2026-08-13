import { AppError } from '@ramassa/shared/errors';
import type { PreparedMediaDeletion } from './delete-media-item';

interface RpcOptions {
  readonly mediaItemId: string;
  readonly token: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly fetchImplementation?: typeof fetch;
}

function rpcHeaders(options: RpcOptions): Record<string, string> {
  return {
    apikey: options.supabasePublishableKey,
    authorization: `Bearer ${options.token}`,
    'content-type': 'application/json',
  };
}

export async function prepareMediaItemDeletion(
  options: RpcOptions,
): Promise<PreparedMediaDeletion> {
  const response = await (options.fetchImplementation ?? fetch)(
    `${options.supabaseUrl}/rest/v1/rpc/prepare_media_item_deletion`,
    {
      method: 'POST',
      headers: rpcHeaders(options),
      body: JSON.stringify({ p_media_item_id: options.mediaItemId }),
    },
  );
  if (!response.ok) throw new AppError(response.status === 403 ? 'AUTH-3' : 'DB-1');
  const rows = (await response.json()) as unknown;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (
    row === undefined ||
    typeof row !== 'object' ||
    row === null ||
    typeof (row as { file_object_key?: unknown }).file_object_key !== 'string'
  ) {
    throw new AppError('DB-1');
  }
  const thumbnail = (row as { thumbnail_object_key?: unknown }).thumbnail_object_key;
  if (thumbnail !== null && typeof thumbnail !== 'string') throw new AppError('DB-1');
  return {
    fileObjectKey: (row as { file_object_key: string }).file_object_key,
    thumbnailObjectKey: thumbnail,
  };
}

export async function completeMediaItemDeletion(
  options: RpcOptions & PreparedMediaDeletion,
): Promise<boolean> {
  const response = await (options.fetchImplementation ?? fetch)(
    `${options.supabaseUrl}/rest/v1/rpc/complete_media_item_deletion`,
    {
      method: 'POST',
      headers: rpcHeaders(options),
      body: JSON.stringify({
        p_media_item_id: options.mediaItemId,
        p_file_object_key: options.fileObjectKey,
        p_thumbnail_object_key: options.thumbnailObjectKey,
      }),
    },
  );
  if (!response.ok) throw new AppError(response.status === 403 ? 'AUTH-3' : 'DB-1');
  return true;
}

export async function canReadMediaObject(
  options: Omit<RpcOptions, 'mediaItemId'> & { readonly objectKey: string },
): Promise<boolean> {
  const response = await (options.fetchImplementation ?? fetch)(
    `${options.supabaseUrl}/rest/v1/rpc/can_read_media_object`,
    {
      method: 'POST',
      headers: rpcHeaders({ ...options, mediaItemId: '' }),
      body: JSON.stringify({ p_object_key: options.objectKey }),
    },
  );
  if (!response.ok) throw new AppError('DB-1');
  return (await response.json()) === true;
}
