/**
 * The mint endpoint: the one place that decides whether a byte may be written.
 *
 * Everything it needs from the outside world arrives as an injected dependency
 * (identity, rate limiter, signer, clock), so the whole policy is testable
 * without a network, a JWT, or Cloudflare credentials, and `index.ts` stays a
 * thin wiring layer over the real bindings. Same pattern as the shared Supabase
 * and i18n factories (CONVENTIONS.md).
 *
 * Order is deliberate: authenticate, then rate-limit, then validate, then
 * authorize the folder, and only then sign. Nothing expensive or signable
 * happens for a caller who has already failed a cheaper check.
 */

import { isAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  getUploadErrorCodeForIssue,
  isFolderWritableByRole,
  uploadUrlRequestSchema,
  type UploadContentType,
  type UploadFolder,
  type UploadUrlResponse,
} from '@ramassa/shared/schemas';
import { errorResponse, jsonResponse } from './http';
import { generateObjectKey } from './object-key';
import type { CallerIdentity } from './supabase-identity';

export interface UploadTarget {
  readonly objectKey: string;
  readonly contentType: UploadContentType;
  readonly contentLength: number;
  readonly expiresInSeconds: number;
}

export interface SignedUploadTarget {
  readonly uploadUrl: string;
  readonly requiredHeaders: Record<string, string>;
}

export interface MintUploadUrlDependencies {
  readonly resolveIdentity: (request: Request) => Promise<CallerIdentity>;
  /** Structurally the Workers rate-limit binding, so tests need no workerd. */
  readonly rateLimiter: { limit(options: { key: string }): Promise<{ success: boolean }> };
  readonly createUploadTarget: (target: UploadTarget) => Promise<SignedUploadTarget>;
  readonly uploadUrlTtlSeconds: number;
  readonly now: () => Date;
  readonly corsHeaders?: Record<string, string>;
  readonly onError?: (error: unknown, context: Record<string, unknown>) => void;
}

async function readJsonBody(request: Request): Promise<unknown | undefined> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

export async function handleMintUploadUrl(
  request: Request,
  dependencies: MintUploadUrlDependencies,
): Promise<Response> {
  const corsHeaders = dependencies.corsHeaders ?? {};
  const fail = (code: AppErrorCode): Response => errorResponse(code, corsHeaders);

  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST', ...corsHeaders } });
  }

  let identity: CallerIdentity;
  try {
    identity = await dependencies.resolveIdentity(request);
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'identity' });
    return fail(isAppError(thrown) ? thrown.code : 'AUTH-2');
  }

  const rateLimit = await dependencies.rateLimiter.limit({ key: identity.userId });
  if (!rateLimit.success) {
    return fail('UPLOAD-4');
  }

  const body = await readJsonBody(request);
  if (body === undefined) {
    return fail('VALIDATION-1');
  }

  const parsed = uploadUrlRequestSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return fail(firstIssue === undefined ? 'VALIDATION-1' : getUploadErrorCodeForIssue(firstIssue));
  }

  const folder: UploadFolder = parsed.data.folder;
  if (!isFolderWritableByRole(folder, identity.role)) {
    return fail('AUTH-3');
  }

  const generatedAt = dependencies.now();
  const objectKey = generateObjectKey({
    identity,
    folder,
    contentType: parsed.data.contentType,
    generatedAt,
  });

  let signed: SignedUploadTarget;
  try {
    signed = await dependencies.createUploadTarget({
      objectKey,
      contentType: parsed.data.contentType,
      contentLength: parsed.data.contentLength,
      expiresInSeconds: dependencies.uploadUrlTtlSeconds,
    });
  } catch (thrown) {
    dependencies.onError?.(thrown, { stage: 'sign', folder });
    return fail(isAppError(thrown) ? thrown.code : 'UPLOAD-1');
  }

  const response: UploadUrlResponse = {
    uploadUrl: signed.uploadUrl,
    objectKey,
    expiresAt: new Date(
      generatedAt.getTime() + dependencies.uploadUrlTtlSeconds * 1000,
    ).toISOString(),
    requiredHeaders: signed.requiredHeaders,
  };

  return jsonResponse(response, { status: 200, headers: corsHeaders });
}
