import { logger } from '@/lib/observability';
import { useEffect, useState } from 'react';
import { AppError } from '@ramassa/shared/errors';
import { buildMediaObjectUrl } from '@ramassa/shared/upload-client';

export interface AuthenticatedMediaImageProps {
  readonly objectKeyOrUrl: string;
  readonly mediaWorkerUrl: string;
  readonly accessToken: string | undefined;
  readonly alt: string;
  readonly className?: string;
}

export interface LoadAuthenticatedMediaObjectOptions {
  readonly objectKey: string;
  readonly mediaWorkerUrl: string;
  readonly accessToken: string;
  readonly fetchImplementation?: (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => Promise<Response>;
  readonly createObjectUrl?: (blob: Blob) => string;
}

export async function loadAuthenticatedMediaObjectUrl(
  options: LoadAuthenticatedMediaObjectOptions,
): Promise<string> {
  const response = await (options.fetchImplementation ?? fetch)(
    buildMediaObjectUrl(options.mediaWorkerUrl, options.objectKey),
    { headers: { authorization: `Bearer ${options.accessToken}` } },
  );
  if (!response.ok) {
    throw new AppError('UPLOAD-1', {
      message: 'Media request was refused',
      context: { status: response.status },
    });
  }
  return (options.createObjectUrl ?? URL.createObjectURL)(await response.blob());
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
 * Browser image elements cannot attach an Authorization header. Fetch the
 * protected object first, then give the element a short-lived local blob URL.
 */
export function AuthenticatedMediaImage({
  objectKeyOrUrl,
  mediaWorkerUrl,
  accessToken,
  alt,
  className,
}: AuthenticatedMediaImageProps) {
  const absoluteUrl = isAbsoluteHttpUrl(objectKeyOrUrl) ? objectKeyOrUrl : null;
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(absoluteUrl);

  useEffect(() => {
    setResolvedUrl(absoluteUrl);
    if (absoluteUrl !== null || mediaWorkerUrl.length === 0 || accessToken === undefined) {
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl: string | undefined;
    void loadAuthenticatedMediaObjectUrl({
      objectKey: objectKeyOrUrl,
      mediaWorkerUrl,
      accessToken,
      fetchImplementation: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    })
      .then((loadedUrl) => {
        objectUrl = loadedUrl;
        if (controller.signal.aborted) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setResolvedUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          logger.warn('knowledge preview image could not be loaded', { code: 'UPLOAD-1' });
        }
      });

    return () => {
      controller.abort();
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [absoluteUrl, accessToken, mediaWorkerUrl, objectKeyOrUrl]);

  return resolvedUrl === null ? null : (
    <img src={resolvedUrl} alt={alt} className={className} loading="lazy" />
  );
}
