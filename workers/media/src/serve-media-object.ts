/**
 * Authenticated delivery for private R2 objects (RAPP-109).
 *
 * The database stores server-generated object keys, not public URLs. This
 * endpoint verifies the caller with the same identity boundary used by uploads,
 * checks that the key begins with her organization, and streams the R2 body.
 * A cross-organization key and an absent key deliberately look identical.
 *
 * Byte ranges (RAPP-895): a single `Range: bytes=...` is answered with 206 and
 * only those bytes, because the iOS video player reads a file in ranges and
 * refuses a source that answers a ranged request with the whole file.
 */

import { isAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { UPLOAD_FOLDERS } from '@ramassa/shared/schemas';
import { MEDIA_OBJECT_PATH_PREFIX } from '@ramassa/shared/upload-client';
import { errorResponse } from './http';
import type { CallerIdentity } from './supabase-identity';

interface MediaObject {
  readonly body: ReadableStream;
  readonly size: number;
  readonly httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

export interface MediaObjectBucket {
  get(key: string): Promise<MediaObject | null>;
}

/** The slice of an object a ranged read asks storage for. */
interface StoredByteRange {
  readonly offset: number;
  readonly length: number;
}

interface MediaObjectSummary {
  readonly size: number;
  readonly httpEtag: string;
}

/** The private object bucket: whole reads, and ranged reads once the size is known. */
export interface RangedMediaObjectBucket {
  head(key: string): Promise<MediaObjectSummary | null>;
  get(key: string, options?: { readonly range?: StoredByteRange }): Promise<MediaObject | null>;
}

export interface ServeMediaObjectDependencies {
  readonly resolveIdentity: (request: Request) => Promise<CallerIdentity>;
  readonly authorizeGalleryObject: (objectKey: string) => Promise<boolean>;
  readonly authorizeFeedbackObject: (objectKey: string) => Promise<boolean>;
  readonly authorizeInternalDocumentObject: (objectKey: string) => Promise<boolean>;
  readonly authorizeStockObject: (objectKey: string) => Promise<boolean>;
  /** Her answer files (RAPP-610): hers, or staff who may read the answer's privacy level. */
  readonly authorizeCustomAnswerObject: (objectKey: string) => Promise<boolean>;
  /**
   * A profile photo (RAPP-639): the team, its uploader or owner, or anyone in
   * the organization for a team member's current photo.
   */
  readonly authorizeProfilePhotoObject: (objectKey: string) => Promise<boolean>;
  readonly bucket: RangedMediaObjectBucket;
  readonly corsHeaders?: Record<string, string>;
  readonly onError?: (error: unknown, context: Record<string, unknown>) => void;
}

/** What a `Range` header asks for, before the object size is known. */
type RequestedByteRange =
  | { readonly kind: 'from'; readonly start: number; readonly end: number | null }
  | { readonly kind: 'suffix'; readonly length: number };

/**
 * Reads one `bytes` range. Anything else (another unit, several ranges, a
 * malformed value) returns null, and the caller sends the whole object, which
 * is what HTTP allows for a range header a server does not serve.
 */
function readRequestedByteRange(header: string | null): RequestedByteRange | null {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return null;
  const [, startDigits = '', endDigits = ''] = match;

  if (startDigits === '') {
    if (endDigits === '') return null;
    const length = Number(endDigits);
    return Number.isSafeInteger(length) ? { kind: 'suffix', length } : null;
  }

  const start = Number(startDigits);
  const end = endDigits === '' ? null : Number(endDigits);
  if (!Number.isSafeInteger(start) || (end !== null && !Number.isSafeInteger(end))) return null;
  if (end !== null && end < start) return null;
  return { kind: 'from', start, end };
}

/** The bytes to read for a request, or null when the object has none of them. */
function resolveStoredByteRange(
  requested: RequestedByteRange,
  objectSize: number,
): StoredByteRange | null {
  if (requested.kind === 'suffix') {
    if (requested.length === 0 || objectSize === 0) return null;
    const length = Math.min(requested.length, objectSize);
    return { offset: objectSize - length, length };
  }
  if (requested.start >= objectSize) return null;
  const lastByte = Math.min(requested.end ?? objectSize - 1, objectSize - 1);
  return { offset: requested.start, length: lastByte - requested.start + 1 };
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
    !/^[0-9a-f]{32}\.(jpg|png|webp|mp4|mov|pdf|doc|docx)$/i.test(fileName)
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

  if (objectKey.split('/')[1] === 'feedback') {
    try {
      if (!(await dependencies.authorizeFeedbackObject(objectKey))) return notFound(corsHeaders);
    } catch (thrown) {
      dependencies.onError?.(thrown, { stage: 'authorize-feedback-object' });
      return fail('DB-1');
    }
  }

  if (objectKey.split('/')[1] === 'documents') {
    try {
      if (!(await dependencies.authorizeInternalDocumentObject(objectKey))) {
        return notFound(corsHeaders);
      }
    } catch (thrown) {
      dependencies.onError?.(thrown, { stage: 'authorize-internal-document-object' });
      return fail('DB-1');
    }
  }

  if (objectKey.split('/')[1] === 'stock') {
    try {
      if (!(await dependencies.authorizeStockObject(objectKey))) return notFound(corsHeaders);
    } catch (thrown) {
      dependencies.onError?.(thrown, { stage: 'authorize-stock-object' });
      return fail('DB-1');
    }
  }

  if (objectKey.split('/')[1] === 'intake-answers') {
    try {
      if (!(await dependencies.authorizeCustomAnswerObject(objectKey)))
        return notFound(corsHeaders);
    } catch (thrown) {
      dependencies.onError?.(thrown, { stage: 'authorize-custom-answer-object' });
      return fail('DB-1');
    }
  }

  if (objectKey.split('/')[1] === 'profile-photos') {
    try {
      if (!(await dependencies.authorizeProfilePhotoObject(objectKey))) {
        return notFound(corsHeaders);
      }
    } catch (thrown) {
      dependencies.onError?.(thrown, { stage: 'authorize-profile-photo-object' });
      return fail('DB-1');
    }
  }

  // A ranged read needs the object size first: it decides between 206 and 416,
  // and it turns an open-ended or suffix range into exact bytes.
  let storedRange: StoredByteRange | undefined;
  const requestedRange = readRequestedByteRange(request.headers.get('Range'));
  if (requestedRange !== null) {
    let summary: MediaObjectSummary | null;
    try {
      summary = await dependencies.bucket.head(objectKey);
    } catch (thrown) {
      dependencies.onError?.(thrown, { stage: 'head-object' });
      return fail('UPLOAD-6');
    }
    if (summary === null) return notFound(corsHeaders);

    // If-Range: the range holds only for the version the caller already has.
    const validator = request.headers.get('If-Range');
    if (validator === null || validator === summary.httpEtag) {
      const resolved = resolveStoredByteRange(requestedRange, summary.size);
      if (resolved === null) {
        const headers = new Headers(corsHeaders);
        headers.set('Content-Range', `bytes */${summary.size}`);
        headers.set('Accept-Ranges', 'bytes');
        return new Response(null, { status: 416, headers });
      }
      storedRange = resolved;
    }
  }

  let object: MediaObject | null;
  try {
    object = await dependencies.bucket.get(
      objectKey,
      storedRange === undefined ? undefined : { range: storedRange },
    );
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'get-object' });
    return fail('UPLOAD-6');
  }
  if (object === null) return notFound(corsHeaders);

  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('X-Content-Type-Options', 'nosniff');

  if (storedRange === undefined) {
    headers.set('Content-Length', String(object.size));
    return new Response(object.body, { status: 200, headers });
  }

  const lastByte = storedRange.offset + storedRange.length - 1;
  headers.set('Content-Range', `bytes ${storedRange.offset}-${lastByte}/${object.size}`);
  headers.set('Content-Length', String(storedRange.length));
  return new Response(object.body, { status: 206, headers });
}
