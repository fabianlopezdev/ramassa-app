import { beforeEach, describe, expect, test } from 'bun:test';
import { buildLocalUploadUrl, handleLocalUpload, LOCAL_UPLOAD_PATH_PREFIX } from './local-upload';

const secret = 'local-development-secret';
const objectKey = 'org/gallery/user/2026/07/abc123.jpg';
const contentType = 'image/jpeg';
const fileBytes = new Uint8Array(64).fill(7);
const signedAt = new Date('2026-07-23T09:15:00.000Z');

interface StoredObject {
  readonly body: ArrayBuffer;
  readonly httpMetadata?: { contentType?: string };
}

function createFakeBucket() {
  const objects = new Map<string, StoredObject>();
  return {
    objects,
    put: async (
      key: string,
      body: ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string } },
    ) => {
      objects.set(key, { body, httpMetadata: options?.httpMetadata });
      return { key };
    },
  };
}

let bucket: ReturnType<typeof createFakeBucket>;

beforeEach(() => {
  bucket = createFakeBucket();
});

async function mintUrl(overrides: Partial<Parameters<typeof buildLocalUploadUrl>[0]> = {}) {
  return buildLocalUploadUrl({
    workerOrigin: 'http://localhost:8787',
    secret,
    objectKey,
    contentType,
    contentLength: fileBytes.byteLength,
    expiresInSeconds: 300,
    signedAt,
    ...overrides,
  });
}

async function put(
  url: string,
  init: { body?: BodyInit; contentType?: string; now?: Date } = {},
): Promise<Response> {
  const request = new Request(url, {
    method: 'PUT',
    headers: { 'content-type': init.contentType ?? contentType },
    body: init.body ?? fileBytes,
  });
  return handleLocalUpload(request, {
    bucket,
    secret,
    now: () => init.now ?? new Date('2026-07-23T09:16:00.000Z'),
  });
}

describe('buildLocalUploadUrl', () => {
  test('points back at this Worker, under the local upload prefix', async () => {
    const url = new URL(await mintUrl());
    expect(url.origin).toBe('http://localhost:8787');
    expect(url.pathname).toBe(`${LOCAL_UPLOAD_PATH_PREFIX}/${objectKey}`);
    expect(url.searchParams.get('signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('handleLocalUpload', () => {
  test('accepts the minted URL and stores the object under the generated key', async () => {
    const response = await put(await mintUrl());
    expect(response.status).toBe(200);
    expect(bucket.objects.has(objectKey)).toBe(true);
    expect(bucket.objects.get(objectKey)?.httpMetadata?.contentType).toBe(contentType);
  });

  test('rejects a tampered object key', async () => {
    const url = (await mintUrl()).replace(objectKey, 'org/gallery/someone-else/2026/07/abc123.jpg');
    expect((await put(url)).status).toBe(403);
    expect(bucket.objects.size).toBe(0);
  });

  test('rejects a tampered declared size', async () => {
    const url = new URL(await mintUrl());
    url.searchParams.set('size', '99999999');
    expect((await put(url.toString())).status).toBe(403);
  });

  test('rejects a body larger than the size that was signed', async () => {
    const response = await put(await mintUrl(), { body: new Uint8Array(65).fill(7) });
    expect(response.status).toBe(403);
    expect(bucket.objects.size).toBe(0);
  });

  test('rejects a content type other than the one that was signed', async () => {
    const response = await put(await mintUrl(), { contentType: 'application/pdf' });
    expect(response.status).toBe(403);
  });

  test('rejects an expired URL', async () => {
    const response = await put(await mintUrl(), { now: new Date('2026-07-23T09:25:00.000Z') });
    expect(response.status).toBe(403);
    expect(bucket.objects.size).toBe(0);
  });

  test('rejects a URL signed with a different secret', async () => {
    const foreign = await mintUrl({ secret: 'some-other-secret' });
    expect((await put(foreign)).status).toBe(403);
  });

  test('rejects a request with no signature at all', async () => {
    const response = await put(`http://localhost:8787${LOCAL_UPLOAD_PATH_PREFIX}/${objectKey}`);
    expect(response.status).toBe(403);
  });
});
