/**
 * The one way app code uploads a file (RAPP-14 scope item 6). Both apps call
 * this; neither talks to the media Worker or to R2 directly.
 *
 *   prepare (optional) -> mint a URL -> PUT the bytes -> return the stored key
 *
 * It never rejects: everything comes back as `Result<T, AppError>` so a failed
 * upload is a value the UI can render (translated message + short code), not an
 * exception that has to be caught in every screen.
 *
 * `prepareFile` is the compression hook point for ADR-013. Client-side image
 * compression (`expo-image-manipulator`, 1 MB / 1200 px) arrives with the first
 * real upload feature in Phase 3 and plugs in here, so no screen ever has to
 * remember to compress: it passes a preparer or it does not upload images.
 */

import { AppError, safeAsync, type Result } from '../errors';
import { errorCodeRegistry, type AppErrorCode } from '../errors/codes';
import {
  getUploadErrorCodeForIssue,
  uploadUrlRequestSchema,
  uploadUrlResponseSchema,
  type UploadContentType,
  type UploadFolder,
} from '../schemas/upload';

export const MINT_UPLOAD_URL_PATH = '/uploads/url';

export interface UploadFileContent {
  /** The exact bytes to send. */
  readonly data: Blob | ArrayBuffer | Uint8Array;
  readonly contentType: UploadContentType;
  /** Declared up front so the Worker can bind it into the signature. */
  readonly byteLength: number;
}

export type UploadFilePreparer = (file: UploadFileContent) => Promise<UploadFileContent>;

export interface UploadFileOptions {
  readonly mediaWorkerUrl: string;
  readonly accessToken: string;
  readonly folder: UploadFolder;
  readonly file: UploadFileContent;
  /** ADR-013 compression hook; runs before anything is declared or sent. */
  readonly prepareFile?: UploadFilePreparer;
  readonly fetchImplementation?: typeof fetch;
  /** Observation hook: the app-wired logger/Sentry pair passes its own here. */
  readonly onError?: (error: AppError) => void;
}

export interface UploadedFile {
  readonly objectKey: string;
}

function isKnownErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && value in errorCodeRegistry;
}

/** Reads the `{ error: { code } }` body the media Worker returns on refusal. */
async function readWorkerErrorCode(response: Response): Promise<AppErrorCode> {
  const body = await response.json().catch(() => undefined);
  const code = (body as { error?: { code?: unknown } } | undefined)?.error?.code;
  return isKnownErrorCode(code) ? code : 'UPLOAD-1';
}

function toRequestBody(data: UploadFileContent['data']): RequestInit['body'] {
  return data as RequestInit['body'];
}

/**
 * A transport failure (no connection, DNS, TLS) is a NETWORK problem, not an
 * upload problem: players on patchy data deserve "check your connection", not
 * "the upload failed", and the two codes carry different translated advice.
 */
async function fetchOrThrowNetworkError(
  performFetch: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await performFetch(input, init);
  } catch (cause) {
    throw new AppError('NETWORK-1', { cause });
  }
}

export async function uploadFile(
  options: UploadFileOptions,
): Promise<Result<UploadedFile, AppError>> {
  const performFetch = options.fetchImplementation ?? fetch;

  return safeAsync(
    async () => {
      const file = options.prepareFile ? await options.prepareFile(options.file) : options.file;

      // Validate before spending a round trip, with the same schema the Worker
      // re-validates with: the client checks for UX, the server for security.
      const request = uploadUrlRequestSchema.safeParse({
        folder: options.folder,
        contentType: file.contentType,
        contentLength: file.byteLength,
      });
      if (!request.success) {
        const firstIssue = request.error.issues[0];
        throw new AppError(
          firstIssue === undefined ? 'VALIDATION-1' : getUploadErrorCodeForIssue(firstIssue),
        );
      }

      const mintResponse = await fetchOrThrowNetworkError(
        performFetch,
        `${options.mediaWorkerUrl}${MINT_UPLOAD_URL_PATH}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(request.data),
        },
      );

      if (!mintResponse.ok) {
        throw new AppError(await readWorkerErrorCode(mintResponse), {
          context: { status: mintResponse.status },
        });
      }

      // An external response is parsed, never trusted (CONVENTIONS.md rule 2).
      const minted = uploadUrlResponseSchema.safeParse(await mintResponse.json());
      if (!minted.success) {
        throw new AppError('UPLOAD-1', { message: 'Malformed mint response' });
      }

      const storeResponse = await fetchOrThrowNetworkError(performFetch, minted.data.uploadUrl, {
        method: 'PUT',
        // Exactly the signed headers: anything else, and storage rejects it.
        headers: minted.data.requiredHeaders,
        body: toRequestBody(file.data),
      });

      if (!storeResponse.ok) {
        // 403 from R2 means the signature no longer matches: expired, or the
        // bytes are not what was declared.
        throw new AppError(storeResponse.status === 403 ? 'UPLOAD-5' : 'UPLOAD-6', {
          context: { status: storeResponse.status },
        });
      }

      return { objectKey: minted.data.objectKey };
    },
    {
      // A thrown non-AppError here is a transport or runtime failure; the
      // typed failures above pass through untouched.
      code: 'UPLOAD-1',
      context: { folder: options.folder },
      onError: options.onError,
    },
  );
}
