/**
 * Authenticated delivery for private R2 objects (RAPP-109).
 *
 * The database stores server-generated object keys, not public URLs. This
 * endpoint verifies the caller with the same identity boundary used by uploads,
 * checks that the key begins with her organization, and streams the R2 body.
 * A cross-organization key and an absent key deliberately look identical.
 */

import { isAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { UPLOAD_FOLDERS } from '@ramassa/shared/schemas';
import { MEDIA_OBJECT_PATH_PREFIX } from '@ramassa/shared/upload-client';
import { errorResponse } from './http';
import type { CallerIdentity } from './supabase-identity';

export interface MediaObject {
  readonly body: ReadableStream;
  readonly size: number;
  readonly httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

export interface MediaObjectBucket {
  get(key: string): Promise<MediaObject | null>;
}

export interface ServeMediaObjectDependencies {
  readonly resolveIdentity: (request: Request) => Promise<CallerIdentity>;
  readonly authorizeGalleryObject: (objectKey: string) => Promise<boolean>;
  readonly bucket: MediaObjectBucket;
  readonly corsHeaders?: Record<string, string>;
  readonly onError?: (error: unknown, context: Record<string, unknown>) => void;
}

function readObjectKey(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  const prefix = `${MEDIA_OBJECT_PATH_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return null;

  let key: string;
  try {
    key = decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }

  const [orgId, folder, uploaderId, year, month, fileName, ...extraSegments] = key.split('/');
  if (
    orgId === undefined ||
    uploaderId === undefined ||
    folder === undefined ||
    year === undefined ||
    month === undefined ||
    fileName === undefined ||
    extraSegments.length > 0 ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(orgId) ||
    !(UPLOAD_FOLDERS as readonly string[]).includes(folder) ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(uploaderId) ||
    !/^\d{4}$/.test(year) ||
    !/^(0[1-9]|1[0-2])$/.test(month) ||
    !/^[0-9a-f]{32}\.(jpg|png|webp|mp4|mov|pdf)$/i.test(fileName)
  ) {
    return null;
  }
  return key;
}

function notFound(corsHeaders: Record<string, string>): Response {
  return new Response(null, { status: 404, headers: corsHeaders });
}

export async function handleServeMediaObject(
  request: Request,
  dependencies: ServeMediaObjectDependencies,
): Promise<Response> {
  const corsHeaders = dependencies.corsHeaders ?? {};
  const fail = (code: AppErrorCode): Response => errorResponse(code, corsHeaders);

  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { Allow: 'GET', ...corsHeaders } });
  }

  let identity: CallerIdentity;
  try {
    identity = await dependencies.resolveIdentity(request);
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'identity' });
    return fail(isAppError(thrown) && thrown.code === 'AUTH-2' ? thrown.code : 'AUTH-2');
  }

  const objectKey = readObjectKey(request);
  if (objectKey === null || !objectKey.startsWith(`${identity.orgId}/`)) {
    return notFound(corsHeaders);
  }

  if (objectKey.split('/')[1] === 'gallery') {
    try {
      if (!(await dependencies.authorizeGalleryObject(objectKey))) return notFound(corsHeaders);
    } catch (thrown) {
      dependencies.onError?.(thrown, { stage: 'authorize-gallery-object' });
      return fail('DB-1');
    }
  }

  let object: MediaObject | null;
  try {
    object = await dependencies.bucket.get(objectKey);
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'get-object' });
    return fail('UPLOAD-6');
  }
  if (object === null) return notFound(corsHeaders);

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { status: 200, headers });
}
