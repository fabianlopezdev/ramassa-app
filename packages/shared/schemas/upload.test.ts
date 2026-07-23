import { describe, expect, test } from 'bun:test';
import { tokens } from '../tokens';
import {
  getFileExtensionForUploadContentType,
  getMaxBytesForUploadContentType,
  getUploadErrorCodeForIssue,
  getUploadKindForContentType,
  isFolderWritableByRole,
  STAFF_ONLY_UPLOAD_FOLDERS,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_FOLDERS,
  uploadUrlRequestSchema,
  uploadUrlResponseSchema,
} from './upload';

const validRequest = {
  folder: 'gallery',
  contentType: 'image/jpeg',
  contentLength: 500_000,
} as const;

describe('uploadUrlRequestSchema', () => {
  test('accepts a well-formed request', () => {
    expect(uploadUrlRequestSchema.parse(validRequest)).toEqual({ ...validRequest });
  });

  test('rejects a folder the app does not define', () => {
    const result = uploadUrlRequestSchema.safeParse({ ...validRequest, folder: '../../etc' });
    expect(result.success).toBe(false);
  });

  test('rejects a content type outside the allowlist', () => {
    const result = uploadUrlRequestSchema.safeParse({
      ...validRequest,
      contentType: 'application/x-msdownload',
    });
    expect(result.success).toBe(false);
    expect(getUploadErrorCodeForIssue(result.error!.issues[0]!)).toBe('UPLOAD-2');
  });

  test('rejects an image over the image cap with a size-specific code', () => {
    const result = uploadUrlRequestSchema.safeParse({
      ...validRequest,
      contentLength: tokens.upload.maxImageBytes + 1,
    });
    expect(result.success).toBe(false);
    expect(getUploadErrorCodeForIssue(result.error!.issues[0]!)).toBe('UPLOAD-3');
  });

  test('accepts a video far over the image cap but under the video cap', () => {
    const result = uploadUrlRequestSchema.safeParse({
      folder: 'gallery',
      contentType: 'video/mp4',
      contentLength: tokens.upload.maxImageBytes * 5,
    });
    expect(result.success).toBe(true);
  });

  test('rejects a video over the video cap', () => {
    const result = uploadUrlRequestSchema.safeParse({
      folder: 'gallery',
      contentType: 'video/mp4',
      contentLength: tokens.upload.maxVideoBytes + 1,
    });
    expect(result.success).toBe(false);
    expect(getUploadErrorCodeForIssue(result.error!.issues[0]!)).toBe('UPLOAD-3');
  });

  test('rejects a zero-byte or negative declared size', () => {
    expect(uploadUrlRequestSchema.safeParse({ ...validRequest, contentLength: 0 }).success).toBe(
      false,
    );
    expect(uploadUrlRequestSchema.safeParse({ ...validRequest, contentLength: -1 }).success).toBe(
      false,
    );
  });

  test('rejects a fractional declared size', () => {
    expect(uploadUrlRequestSchema.safeParse({ ...validRequest, contentLength: 10.5 }).success).toBe(
      false,
    );
  });

  test('strips unknown keys so a client cannot smuggle an object key', () => {
    const parsed = uploadUrlRequestSchema.parse({
      ...validRequest,
      objectKey: '../../someone-elses-folder/file.jpg',
    });
    expect(parsed).not.toHaveProperty('objectKey');
  });
});

describe('content-type helpers', () => {
  test('every allowed content type maps to a kind, a cap, and an extension', () => {
    for (const contentType of UPLOAD_CONTENT_TYPES) {
      expect(['image', 'video', 'document']).toContain(getUploadKindForContentType(contentType));
      expect(getMaxBytesForUploadContentType(contentType)).toBeGreaterThan(0);
      expect(getFileExtensionForUploadContentType(contentType)).toMatch(/^[a-z0-9]+$/);
    }
  });

  test('the image cap is the compressed-image ceiling from the tokens (ADR-013)', () => {
    expect(getMaxBytesForUploadContentType('image/jpeg')).toBe(tokens.upload.maxImageBytes);
    expect(getMaxBytesForUploadContentType('video/mp4')).toBe(tokens.upload.maxVideoBytes);
  });
});

describe('folder authorization', () => {
  test('staff-only folders are closed to players and entities', () => {
    for (const folder of STAFF_ONLY_UPLOAD_FOLDERS) {
      expect(isFolderWritableByRole(folder, 'player')).toBe(false);
      expect(isFolderWritableByRole(folder, 'entity')).toBe(false);
      expect(isFolderWritableByRole(folder, 'staff')).toBe(true);
      expect(isFolderWritableByRole(folder, 'admin')).toBe(true);
    }
  });

  test('community folders are open to every signed-in role', () => {
    const staffOnlyFolders: readonly string[] = STAFF_ONLY_UPLOAD_FOLDERS;
    const communityFolders = UPLOAD_FOLDERS.filter((folder) => !staffOnlyFolders.includes(folder));
    expect(communityFolders.length).toBeGreaterThan(0);
    for (const folder of communityFolders) {
      for (const role of ['player', 'staff', 'admin', 'entity'] as const) {
        expect(isFolderWritableByRole(folder, role)).toBe(true);
      }
    }
  });
});

describe('uploadUrlResponseSchema', () => {
  test('parses a well-formed mint response', () => {
    const response = {
      uploadUrl: 'https://account.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=abc',
      objectKey: 'org/gallery/user/2026/07/file.jpg',
      expiresAt: '2026-07-23T10:00:00.000Z',
      requiredHeaders: { 'content-type': 'image/jpeg' },
    };
    expect(uploadUrlResponseSchema.parse(response)).toEqual(response);
  });

  test('rejects a response whose upload URL is not a URL', () => {
    expect(
      uploadUrlResponseSchema.safeParse({
        uploadUrl: 'not-a-url',
        objectKey: 'k',
        expiresAt: '2026-07-23T10:00:00.000Z',
        requiredHeaders: {},
      }).success,
    ).toBe(false);
  });
});
