/**
 * The media Worker entry point (RAPP-14, ADR-002).
 *
 * This file is wiring only: it validates the environment, builds the real
 * dependencies from the bindings, and routes. All policy lives in the handlers,
 * which are pure functions over injected dependencies, so the rules are tested
 * without a network, a JWT, or Cloudflare credentials.
 *
 *   POST /uploads/url    mint a short-TTL upload URL for the signed-in caller
 *   PUT  /local-uploads/*  local development only (see local-upload.ts)
 *   GET  /health         liveness for the deploy runbook
 */

import * as Sentry from '@sentry/cloudflare';
import { MINT_UPLOAD_URL_PATH } from '@ramassa/shared/upload-client';
import { UPLOAD_URL_TTL_SECONDS } from './constants';
import { parseWorkerEnv, type WorkerConfig } from './env';
import { buildCorsHeaders, errorResponse } from './http';
import { buildLocalUploadUrl, handleLocalUpload, LOCAL_UPLOAD_PATH_PREFIX } from './local-upload';
import { handleMintUploadUrl, type SignedUploadTarget, type UploadTarget } from './mint-upload-url';
import { createWorkerObservability } from './observability';
import { presignR2Upload } from './presign';
import { resolveCallerIdentity } from './supabase-identity';

async function createUploadTarget(
  config: WorkerConfig,
  workerOrigin: string,
  target: UploadTarget,
  signedAt: Date,
): Promise<SignedUploadTarget> {
  if (config.uploadMode === 'local') {
    return {
      uploadUrl: await buildLocalUploadUrl({
        workerOrigin,
        secret: config.localUploadSigningSecret,
        objectKey: target.objectKey,
        contentType: target.contentType,
        contentLength: target.contentLength,
        expiresInSeconds: target.expiresInSeconds,
        signedAt,
      }),
      requiredHeaders: { 'content-type': target.contentType },
    };
  }

  return {
    uploadUrl: await presignR2Upload({
      s3Endpoint: config.s3Endpoint,
      bucketName: config.bucketName,
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
      objectKey: target.objectKey,
      contentType: target.contentType,
      contentLength: target.contentLength,
      expiresInSeconds: target.expiresInSeconds,
      signedAt,
    }),
    // Both are inside the signature: R2 rejects the PUT if either differs.
    // `content-length` is set by the HTTP stack from the body itself, which is
    // exactly why an under-declared size cannot slip through.
    requiredHeaders: { 'content-type': target.contentType },
  };
}

const handler: ExportedHandler<Env> = {
  async fetch(request, env) {
    let config: WorkerConfig;
    try {
      config = parseWorkerEnv(env as unknown as Record<string, unknown>);
    } catch (thrown) {
      // A misconfigured deployment is an incident, not a user error: report it
      // with the real reason and tell the caller nothing.
      createWorkerObservability({ sentryDsn: env.SENTRY_DSN, isLocal: false }).reportError(thrown, {
        stage: 'env',
      });
      return errorResponse('UNEXPECTED-1');
    }

    const observability = createWorkerObservability({
      sentryDsn: env.SENTRY_DSN,
      isLocal: config.uploadMode === 'local',
    });
    const corsHeaders = buildCorsHeaders(request, config.allowedOrigins);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200, headers: corsHeaders });
    }

    if (url.pathname === MINT_UPLOAD_URL_PATH) {
      return handleMintUploadUrl(request, {
        resolveIdentity: (incoming) =>
          resolveCallerIdentity({
            request: incoming,
            supabaseUrl: config.supabaseUrl,
            supabasePublishableKey: config.supabasePublishableKey,
          }),
        rateLimiter: env.UPLOAD_RATE_LIMITER,
        createUploadTarget: (target) => createUploadTarget(config, url.origin, target, new Date()),
        uploadUrlTtlSeconds: UPLOAD_URL_TTL_SECONDS,
        now: () => new Date(),
        corsHeaders,
        onError: (thrown, context) => observability.reportError(thrown, context),
      });
    }

    // Unreachable in production: the route only exists while UPLOAD_MODE is
    // `local`, which wrangler.jsonc pins per environment.
    if (config.uploadMode === 'local' && url.pathname.startsWith(`${LOCAL_UPLOAD_PATH_PREFIX}/`)) {
      return handleLocalUpload(request, {
        bucket: env.MEDIA_BUCKET,
        secret: config.localUploadSigningSecret,
        now: () => new Date(),
      });
    }

    return new Response(null, { status: 404, headers: corsHeaders });
  },
};

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN.length > 0 ? env.SENTRY_DSN : undefined,
    // Parity with mobile and admin: the release is the commit SHA, passed at
    // deploy time. The deployment id is the fallback for a manual deploy.
    release: env.SENTRY_RELEASE.length > 0 ? env.SENTRY_RELEASE : env.CF_VERSION_METADATA.id,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  }),
  handler,
);
