import type { ImageSource } from 'expo-image';
import { buildMediaObjectUrl } from '@ramassa/shared/upload-client';

export interface ResolveMediaImageSourceOptions {
  readonly objectKeyOrUrl: string | null;
  readonly mediaWorkerUrl: string | undefined;
  readonly accessToken: string | undefined;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Converts a stored private object key into the source Expo Image understands.
 * Legacy absolute URLs still render, but never receive the user's app token.
 */
export function resolveMediaImageSource(
  options: ResolveMediaImageSourceOptions,
): ImageSource | null {
  const value = options.objectKeyOrUrl;
  if (value === null || value.length === 0) return null;
  if (isAbsoluteHttpUrl(value)) return { uri: value, cacheKey: value };
  if (options.mediaWorkerUrl === undefined || options.accessToken === undefined) return null;

  return {
    uri: buildMediaObjectUrl(options.mediaWorkerUrl, value),
    headers: { authorization: `Bearer ${options.accessToken}` },
    cacheKey: value,
  };
}
