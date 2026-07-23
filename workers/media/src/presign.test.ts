import { describe, expect, test } from 'bun:test';
import { presignR2Upload, type PresignR2UploadOptions } from './presign';

const credentials = {
  s3Endpoint: 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.eu.r2.cloudflarestorage.com',
  bucketName: 'ramassa-media-dev',
  accessKeyId: 'test-access-key-id',
  secretAccessKey: 'test-secret-access-key',
} as const;

const request: Omit<PresignR2UploadOptions, keyof typeof credentials> = {
  objectKey: 'org/gallery/user/2026/07/abc123.jpg',
  contentType: 'image/jpeg',
  contentLength: 12_345,
  expiresInSeconds: 300,
  signedAt: new Date('2026-07-23T09:15:00.000Z'),
};

async function presign(overrides: Partial<PresignR2UploadOptions> = {}) {
  const url = await presignR2Upload({ ...credentials, ...request, ...overrides });
  return new URL(url);
}

describe('presignR2Upload', () => {
  test('targets the S3 endpoint for the account, bucket and generated key', async () => {
    const url = await presign();
    expect(url.origin).toBe(credentials.s3Endpoint);
    expect(url.pathname).toBe(`/${credentials.bucketName}/${request.objectKey}`);
  });

  test('carries a SigV4 query signature that expires with the requested TTL', async () => {
    const url = await presign();
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(request.expiresInSeconds));
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-Date')).toBe('20260723T091500Z');
  });

  // This is the whole point of signing those two headers: the size and type
  // limits are enforced by R2 at PUT time, not merely checked at mint time.
  test('binds the declared content type and size into the signature', async () => {
    const signedHeaders = (await presign()).searchParams.get('X-Amz-SignedHeaders');
    expect(signedHeaders).toContain('content-type');
    expect(signedHeaders).toContain('content-length');
    expect(signedHeaders).toContain('host');
  });

  test('a client that sends a different size cannot reuse the signature', async () => {
    const honest = await presign();
    const inflated = await presign({ contentLength: request.contentLength * 100 });
    expect(inflated.searchParams.get('X-Amz-Signature')).not.toBe(
      honest.searchParams.get('X-Amz-Signature'),
    );
  });

  test('a client that sends a different content type cannot reuse the signature', async () => {
    const asJpeg = await presign();
    const asPdf = await presign({ contentType: 'application/pdf' });
    expect(asPdf.searchParams.get('X-Amz-Signature')).not.toBe(
      asJpeg.searchParams.get('X-Amz-Signature'),
    );
  });

  test('signs deterministically, so the same request yields the same URL', async () => {
    expect((await presign()).toString()).toBe((await presign()).toString());
  });

  test('never leaks the secret access key into the URL', async () => {
    const url = (await presign()).toString();
    expect(url).not.toContain(credentials.secretAccessKey);
    expect(url).toContain(credentials.accessKeyId);
  });
});
