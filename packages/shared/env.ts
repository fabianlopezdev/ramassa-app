/**
 * Environment validation. `process.env` is validated at boot, fail-fast, so a
 * misconfigured deployment dies with a named error listing exactly which keys are
 * missing or malformed instead of surfacing a confusing runtime failure later.
 *
 * The client and server schemas are deliberately separate: the client bundle only
 * ever validates (and therefore only ever references) the public Supabase URL and
 * anon key. The service role key exists only in the server schema, so it can never
 * leak into a client bundle by construction. Each app calls the matching parser at
 * boot, injecting its own env source (`process.env` on mobile/server,
 * `import.meta.env` in the admin client).
 */

import { z } from 'zod';

export const clientEnvSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Optional: without it, error reporting is simply off (local dev, CI).
  // A DSN is an ingest address, not a secret, so it may ship in the client.
  EXPO_PUBLIC_SENTRY_DSN: z.url().optional(),
});

export const serverEnvSchema = clientEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SENTRY_DSN: z.url().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvironmentValidationError extends Error {
  readonly missingOrInvalidKeys: string[];

  constructor(issues: z.core.$ZodIssue[]) {
    const keyLines = issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    super(
      `Environment validation failed. Fix the following variable(s) before boot:\n${keyLines.join('\n')}`,
    );
    this.name = 'EnvironmentValidationError';
    this.missingOrInvalidKeys = issues.map((issue) => String(issue.path[0] ?? ''));
  }
}

function parseWith<Schema extends z.ZodType>(
  schema: Schema,
  source: Record<string, unknown>,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentValidationError(result.error.issues);
  }
  return result.data;
}

const processEnv: Record<string, unknown> =
  typeof process !== 'undefined' && process.env ? process.env : {};

export function parseClientEnv(source: Record<string, unknown> = processEnv): ClientEnv {
  return parseWith(clientEnvSchema, source);
}

export function parseServerEnv(source: Record<string, unknown> = processEnv): ServerEnv {
  return parseWith(serverEnvSchema, source);
}
