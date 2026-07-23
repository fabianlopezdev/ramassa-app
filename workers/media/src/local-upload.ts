/**
 * The local-development upload sink (`UPLOAD_MODE: "local"`).
 *
 * Presigned R2 URLs point at the S3 API endpoint, which `wrangler dev` does not
 * emulate: locally there is an R2 *binding*, not an S3 *endpoint*. Without this
 * module, developing or QA-ing any upload feature would require real Cloudflare
 * R2 credentials on every machine, and the local Maestro flows (contract rule
 * 16) could not run at all.
 *
 * So in local mode the mint endpoint returns a loopback URL served here, signed
 * with an HMAC over exactly what the R2 signature covers (key, content type,
 * byte size, expiry) and enforced the same way: any mismatch is a 403, and the
 * bytes land in the local R2 simulation under the same generated key. The
 * client code path is therefore identical in both modes.
 *
 * This handler is unreachable in production: `index.ts` only routes to it when
 * `UPLOAD_MODE` is `local`, and that value is set per environment in
 * wrangler.jsonc (production is `r2-presigned`). The test suite asserts the
 * routing, not just the handler.
 */

import { AppError } from '@ramassa/shared/errors';

export const LOCAL_UPLOAD_PATH_PREFIX = '/local-uploads';

/** Structural subset of `R2Bucket` this module needs, so tests need no workerd. */
export interface LocalUploadBucket {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
}

interface SignaturePayload {
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly expiresAtEpochSeconds: number;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function encodePayload(payload: SignaturePayload): Uint8Array {
  return new TextEncoder().encode(
    [
      payload.objectKey,
      payload.contentType,
      String(payload.contentLength),
      String(payload.expiresAtEpochSeconds),
    ].join('\n'),
  );
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array | undefined {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) {
    return undefined;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function signPayload(secret: string, payload: SignaturePayload): Promise<string> {
  const key = await importSigningKey(secret);
  return toHex(await crypto.subtle.sign('HMAC', key, encodePayload(payload)));
}

export interface BuildLocalUploadUrlOptions {
  readonly workerOrigin: string;
  readonly secret: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly expiresInSeconds: number;
  readonly signedAt: Date;
}

export async function buildLocalUploadUrl(options: BuildLocalUploadUrlOptions): Promise<string> {
  const expiresAtEpochSeconds =
    Math.floor(options.signedAt.getTime() / 1000) + options.expiresInSeconds;
  const signature = await signPayload(options.secret, {
    objectKey: options.objectKey,
    contentType: options.contentType,
    contentLength: options.contentLength,
    expiresAtEpochSeconds,
  });

  const url = new URL(`${LOCAL_UPLOAD_PATH_PREFIX}/${options.objectKey}`, options.workerOrigin);
  url.searchParams.set('type', options.contentType);
  url.searchParams.set('size', String(options.contentLength));
  url.searchParams.set('expires', String(expiresAtEpochSeconds));
  url.searchParams.set('signature', signature);
  return url.toString();
}

export interface HandleLocalUploadDependencies {
  readonly bucket: LocalUploadBucket;
  readonly secret: string;
  readonly now: () => Date;
}

export async function handleLocalUpload(
  request: Request,
  dependencies: HandleLocalUploadDependencies,
): Promise<Response> {
  if (request.method !== 'PUT') {
    return new Response(null, { status: 405, headers: { Allow: 'PUT' } });
  }

  const url = new URL(request.url);
  const objectKey = decodeURIComponent(url.pathname.slice(LOCAL_UPLOAD_PATH_PREFIX.length + 1));
  const declaredContentType = url.searchParams.get('type') ?? '';
  const declaredContentLength = Number(url.searchParams.get('size'));
  const expiresAtEpochSeconds = Number(url.searchParams.get('expires'));
  const providedSignature = fromHex(url.searchParams.get('signature') ?? '');

  if (
    objectKey.length === 0 ||
    providedSignature === undefined ||
    !Number.isInteger(declaredContentLength) ||
    !Number.isInteger(expiresAtEpochSeconds)
  ) {
    return new Response(null, { status: 403 });
  }

  const key = await importSigningKey(dependencies.secret);
  const signatureIsValid = await crypto.subtle.verify(
    'HMAC',
    key,
    providedSignature,
    encodePayload({
      objectKey,
      contentType: declaredContentType,
      contentLength: declaredContentLength,
      expiresAtEpochSeconds,
    }),
  );
  if (!signatureIsValid) {
    return new Response(null, { status: 403 });
  }

  if (dependencies.now().getTime() / 1000 > expiresAtEpochSeconds) {
    return new Response(null, { status: 403 });
  }

  if (request.headers.get('content-type') !== declaredContentType) {
    return new Response(null, { status: 403 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength !== declaredContentLength) {
    return new Response(null, { status: 403 });
  }

  await dependencies.bucket
    .put(objectKey, body, { httpMetadata: { contentType: declaredContentType } })
    .catch((cause: unknown) => {
      throw new AppError('UPLOAD-6', { message: 'Local R2 simulation rejected the object', cause });
    });

  return new Response(null, { status: 200 });
}
