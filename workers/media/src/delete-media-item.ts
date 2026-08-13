import { z } from 'zod';
import { AppError, isAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { errorResponse, jsonResponse } from './http';
import type { CallerIdentity } from './supabase-identity';

export interface PreparedMediaDeletion {
  readonly fileObjectKey: string;
  readonly thumbnailObjectKey: string | null;
}

export interface DeleteMediaItemDependencies {
  readonly resolveIdentity: (request: Request) => Promise<CallerIdentity>;
  readonly prepareDeletion: (input: {
    readonly mediaItemId: string;
    readonly identity: CallerIdentity;
  }) => Promise<PreparedMediaDeletion>;
  readonly deleteObjects: (keys: readonly string[]) => Promise<void>;
  readonly completeDeletion: (input: {
    readonly mediaItemId: string;
    readonly fileObjectKey: string;
    readonly thumbnailObjectKey: string | null;
    readonly identity: CallerIdentity;
  }) => Promise<boolean>;
  readonly corsHeaders?: Record<string, string>;
  readonly onError?: (error: unknown, context: Record<string, unknown>) => void;
}

function isTenantGalleryKey(key: string, orgId: string): boolean {
  return key.startsWith(`${orgId}/gallery/`) && !key.includes('..') && !key.includes('://');
}

export async function handleDeleteMediaItem(
  request: Request,
  rawMediaItemId: string,
  dependencies: DeleteMediaItemDependencies,
): Promise<Response> {
  const headers = dependencies.corsHeaders ?? {};
  const fail = (code: AppErrorCode) => errorResponse(code, headers);
  if (request.method !== 'DELETE') {
    return new Response(null, { status: 405, headers: { Allow: 'DELETE', ...headers } });
  }

  const parsedId = z.uuid().safeParse(rawMediaItemId);
  if (!parsedId.success) return fail('VALIDATION-1');

  let identity: CallerIdentity;
  try {
    identity = await dependencies.resolveIdentity(request);
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'identity' });
    return fail(isAppError(thrown) ? thrown.code : 'AUTH-2');
  }

  let prepared: PreparedMediaDeletion;
  try {
    prepared = await dependencies.prepareDeletion({ mediaItemId: parsedId.data, identity });
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'prepare', mediaItemId: parsedId.data });
    return fail(isAppError(thrown) ? thrown.code : 'DB-1');
  }

  const keys = [prepared.fileObjectKey, prepared.thumbnailObjectKey].filter(
    (key): key is string => key !== null,
  );
  if (keys.some((key) => !isTenantGalleryKey(key, identity.orgId))) return fail('AUTH-3');

  try {
    await dependencies.deleteObjects([...new Set(keys)]);
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'objects', mediaItemId: parsedId.data });
    return fail('UPLOAD-7');
  }

  try {
    const completed = await dependencies.completeDeletion({
      mediaItemId: parsedId.data,
      ...prepared,
      identity,
    });
    if (!completed) throw new AppError('DB-1');
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'row', mediaItemId: parsedId.data });
    return fail(isAppError(thrown) ? thrown.code : 'DB-1');
  }

  return jsonResponse({ deleted: true }, { status: 200, headers });
}
