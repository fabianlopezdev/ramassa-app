/**
 * Worker configuration, validated fail-fast (the shared rule 3 in
 * CONVENTIONS.md, applied to a runtime that has no `process.env`: bindings
 * arrive per request, so this runs on the first request of an isolate and
 * throws a named error listing every offending key).
 *
 * The mode discriminates which secrets are mandatory: a production deployment
 * without R2 credentials must fail loudly, and a local one without a signing
 * secret must not silently accept unsigned uploads.
 */

import { z } from 'zod';
import { parseAllowedOrigins } from './http';

const nonEmpty = z.string().min(1);

const baseEnvSchema = z.object({
  R2_BUCKET_NAME: nonEmpty,
  R2_S3_ENDPOINT: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: nonEmpty,
  ALLOWED_ORIGINS: z.string(),
});

const workerEnvSchema = z.discriminatedUnion('UPLOAD_MODE', [
  baseEnvSchema.extend({
    UPLOAD_MODE: z.literal('r2-presigned'),
    R2_ACCESS_KEY_ID: nonEmpty,
    R2_SECRET_ACCESS_KEY: nonEmpty,
  }),
  baseEnvSchema.extend({
    UPLOAD_MODE: z.literal('local'),
    LOCAL_UPLOAD_SIGNING_SECRET: nonEmpty,
  }),
]);

export class WorkerEnvironmentValidationError extends Error {
  readonly missingOrInvalidKeys: string[];

  constructor(issues: z.core.$ZodIssue[]) {
    const keyLines = issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    super(`Media Worker environment is invalid:\n${keyLines.join('\n')}`);
    this.name = 'WorkerEnvironmentValidationError';
    this.missingOrInvalidKeys = issues.map((issue) => String(issue.path[0] ?? ''));
  }
}

export interface WorkerConfig {
  readonly uploadMode: 'r2-presigned' | 'local';
  readonly bucketName: string;
  readonly s3Endpoint: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly allowedOrigins: readonly string[];
  readonly r2AccessKeyId: string;
  readonly r2SecretAccessKey: string;
  readonly localUploadSigningSecret: string;
}

export function parseWorkerEnv(source: Record<string, unknown>): WorkerConfig {
  const result = workerEnvSchema.safeParse(source);
  if (!result.success) {
    throw new WorkerEnvironmentValidationError(result.error.issues);
  }

  const env = result.data;
  return {
    uploadMode: env.UPLOAD_MODE,
    bucketName: env.R2_BUCKET_NAME,
    s3Endpoint: env.R2_S3_ENDPOINT.replace(/\/+$/, ''),
    supabaseUrl: env.SUPABASE_URL.replace(/\/+$/, ''),
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    r2AccessKeyId: env.UPLOAD_MODE === 'r2-presigned' ? env.R2_ACCESS_KEY_ID : '',
    r2SecretAccessKey: env.UPLOAD_MODE === 'r2-presigned' ? env.R2_SECRET_ACCESS_KEY : '',
    localUploadSigningSecret: env.UPLOAD_MODE === 'local' ? env.LOCAL_UPLOAD_SIGNING_SECRET : '',
  };
}
