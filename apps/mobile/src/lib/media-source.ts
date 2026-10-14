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

// A photo on this device that is not uploaded yet, shown in a draft's player
// preview (RAPP-373). It never receives the user's app token.
const DEVICE_IMAGE_PROTOCOLS = new Set(['file:', 'blob:', 'data:', 'content:', 'ph:']);

function isDeviceImageUri(value: string): boolean {
  try {
    return DEVICE_IMAGE_PROTOCOLS.has(new URL(value).protocol);
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
  if (isDeviceImageUri(value)) return { uri: value };
  if (options.mediaWorkerUrl === undefined || options.accessToken === undefined) return null;

  return {
    uri: buildMediaObjectUrl(options.mediaWorkerUrl, value),
    headers: { authorization: `Bearer ${options.accessToken}` },
    cacheKey: value,
  };
}
