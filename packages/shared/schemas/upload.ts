/**
 * Upload schemas (RAPP-14): the single validation source for the R2 media
 * pipeline. The client validates a request here for fast feedback; the
 * presigned-URL Worker re-validates the SAME schema before it signs anything,
 * because a client claim about a file is a claim, not a fact (ADR-002).
 *
 * What is deliberately NOT in the request: the object key. Keys are generated
 * server-side from the verified identity, so no caller can choose where its
 * bytes land (`strictObject` would reject an extra key loudly; stripping is
 * quieter and equally safe, and the generated key is the only one signed).
 */

import { z } from 'zod';
import type { AppErrorCode } from '../errors/codes';
import { tokens } from '../tokens';
import type { AppRole } from './auth';

/**
 * Where an upload may land. One folder per feature area, so R2 lifecycle rules,
 * quotas, and audits can be reasoned about per feature. Folders are part of the
 * object key and therefore append-only in practice: renaming one orphans
 * everything already stored under it.
 */
export const UPLOAD_FOLDERS = [
  'profile-photos',
  'announcements',
  'events',
  'forum',
  'gallery',
  'knowledge-base',
  'stories',
  'services',
  'documents',
] as const;

export const uploadFolderSchema = z.enum(UPLOAD_FOLDERS);
export type UploadFolder = z.infer<typeof uploadFolderSchema>;

/**
 * Folders only staff and admins may write to: they hold published content and
 * internal paperwork (SPEC "Internal (staff-only)"), not participant uploads.
 * The Worker enforces this against the role read from the caller's profile,
 * never against a claim in the request.
 */
export const STAFF_ONLY_UPLOAD_FOLDERS = [
  'announcements',
  'events',
  'knowledge-base',
  'services',
  'documents',
] as const satisfies readonly UploadFolder[];

export function isFolderWritableByRole(folder: UploadFolder, role: AppRole): boolean {
  const isStaffOnlyFolder = (STAFF_ONLY_UPLOAD_FOLDERS as readonly UploadFolder[]).includes(folder);
  return isStaffOnlyFolder ? role === 'staff' || role === 'admin' : true;
}

export type UploadKind = 'image' | 'video' | 'document';

interface UploadContentTypeDefinition {
  readonly kind: UploadKind;
  /** Extension appended to the generated object key; drives R2 content sniffing and downloads. */
  readonly fileExtension: string;
}

/**
 * The MIME allowlist. An allowlist, never a blocklist: anything not named here
 * cannot be uploaded, so a new attack surface requires an explicit decision.
 * HEIC is absent on purpose — the mobile client converts to JPEG while
 * compressing (ADR-013), so only web-renderable formats ever reach R2.
 */
export const UPLOAD_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
] as const;

export const uploadContentTypeSchema = z.enum(UPLOAD_CONTENT_TYPES);
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

const uploadContentTypeDefinitions = {
  'image/jpeg': { kind: 'image', fileExtension: 'jpg' },
  'image/png': { kind: 'image', fileExtension: 'png' },
  'image/webp': { kind: 'image', fileExtension: 'webp' },
  'video/mp4': { kind: 'video', fileExtension: 'mp4' },
  'video/quicktime': { kind: 'video', fileExtension: 'mov' },
  'application/pdf': { kind: 'document', fileExtension: 'pdf' },
} as const satisfies Record<UploadContentType, UploadContentTypeDefinition>;

export function getUploadKindForContentType(contentType: UploadContentType): UploadKind {
  return uploadContentTypeDefinitions[contentType].kind;
}

export function getFileExtensionForUploadContentType(contentType: UploadContentType): string {
  return uploadContentTypeDefinitions[contentType].fileExtension;
}

/**
 * The hard byte ceiling per kind. Images are capped at the COMPRESSED ceiling
 * (ADR-013): the client compresses to <= 1 MB before asking for a URL, so a
 * larger declared size means the client skipped compression.
 */
export function getMaxBytesForUploadContentType(contentType: UploadContentType): number {
  const kind = getUploadKindForContentType(contentType);
  if (kind === 'image') {
    return tokens.upload.maxImageBytes;
  }
  return tokens.upload.maxVideoBytes;
}

/**
 * A mint request: what the client declares about the file it is about to send.
 * Every field is re-checked server-side, and `contentLength` is additionally
 * pinned into the presigned signature, so a client that under-declares its size
 * gets a signature mismatch from R2 rather than a free pass.
 */
export const uploadUrlRequestSchema = z
  .object({
    folder: uploadFolderSchema,
    contentType: uploadContentTypeSchema,
    contentLength: z.int().positive(),
  })
  .superRefine((request, context) => {
    const maxBytes = getMaxBytesForUploadContentType(request.contentType);
    if (request.contentLength > maxBytes) {
      context.addIssue({
        code: 'too_big',
        origin: 'number',
        maximum: maxBytes,
        inclusive: true,
        path: ['contentLength'],
        message: `File exceeds the ${maxBytes}-byte limit for this file type`,
      });
    }
  });

export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

/**
 * The mint response. `requiredHeaders` is not advisory: those exact headers are
 * inside the signature, so the PUT fails at R2 if the client changes any of
 * them. The client sends them verbatim rather than composing its own.
 */
export const uploadUrlResponseSchema = z.object({
  uploadUrl: z.url(),
  objectKey: z.string().min(1),
  expiresAt: z.iso.datetime(),
  requiredHeaders: z.record(z.string(), z.string()),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

/**
 * Maps a validation failure to the error code the user should see, so a
 * rejected upload says "wrong file type" or "too big" instead of a generic
 * "check the form" (the codes carry translated, actionable messages).
 */
export function getUploadErrorCodeForIssue(issue: z.core.$ZodIssue): AppErrorCode {
  const field = issue.path[0];
  if (field === 'contentType') {
    return 'UPLOAD-2';
  }
  if (field === 'contentLength') {
    return issue.code === 'too_big' ? 'UPLOAD-3' : 'VALIDATION-1';
  }
  return 'VALIDATION-1';
}
