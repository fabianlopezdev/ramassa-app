import { z } from 'zod';
import { AppError } from '@ramassa/shared/errors';
import { errorResponse } from './http';
import type { MediaObjectBucket } from './serve-media-object';

const uuid = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const logoKeySchema = z
  .string()
  .regex(
    new RegExp(
      `^${uuid}/organization-branding/${uuid}/\\d{4}/(0[1-9]|1[0-2])/[0-9a-f]{32}\\.(jpg|png|webp)$`,
      'i',
    ),
  )
  .nullable();

export async function resolvePublicOrganizationLogo(options: {
  readonly slug: string;
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly fetchImplementation?: typeof fetch;
}): Promise<string | null> {
  const response = await (options.fetchImplementation ?? fetch)(
    `${options.supabaseUrl}/rest/v1/rpc/get_public_organization_logo`,
    {
      method: 'POST',
      headers: { apikey: options.supabasePublishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_slug: options.slug }),
    },
  );
  if (!response.ok) throw new AppError('DB-1');
  const result = logoKeySchema.safeParse(await response.json());
  if (!result.success) throw new AppError('DB-1');
  return result.data;
}

export async function handleServeOrganizationLogo(
  request: Request,
  dependencies: {
    readonly resolveLogo: (slug: string) => Promise<string | null>;
    readonly bucket: MediaObjectBucket;
    readonly corsHeaders?: Record<string, string>;
    readonly onError?: (error: unknown, context: Record<string, unknown>) => void;
  },
): Promise<Response> {
  const headers = new Headers(dependencies.corsHeaders);
  headers.set('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    headers.set('Allow', 'GET');
    return new Response(null, { status: 405, headers });
  }
  const match = /^\/branding\/([a-z0-9]+(?:-[a-z0-9]+)*)\/logo$/.exec(
    new URL(request.url).pathname,
  );
  if (match === null) return new Response(null, { status: 404, headers });
  try {
    const parsed = logoKeySchema.safeParse(await dependencies.resolveLogo(match[1]!));
    if (!parsed.success || parsed.data === null)
      return new Response(null, { status: 404, headers });
    const object = await dependencies.bucket.get(parsed.data);
    if (object === null) return new Response(null, { status: 404, headers });
    object.writeHttpMetadata(headers);
    headers.set(
      'Content-Type',
      parsed.data.endsWith('.png')
        ? 'image/png'
        : parsed.data.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg',
    );
    headers.set('Cache-Control', 'no-store');
    headers.set('Content-Length', String(object.size));
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { headers });
  } catch (error) {
    dependencies.onError?.(error, { stage: 'public-organization-logo' });
    return errorResponse('DB-1', { ...dependencies.corsHeaders, 'Cache-Control': 'no-store' });
  }
}
