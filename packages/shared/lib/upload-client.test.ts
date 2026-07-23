import { describe, expect, test } from 'bun:test';
import { uploadFile, type UploadFileOptions } from './upload-client';

const mediaWorkerUrl = 'https://media.ramassa.test';
const objectKey = 'org/gallery/user/2026/07/abc123.jpg';
const fileBytes = new Uint8Array(2048).fill(3);

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: RequestInit['body'];
}

function createFetchStub(responders: Array<(call: RecordedCall) => Response>): {
  fetch: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchStub = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body,
    };
    calls.push(call);
    const responder = responders[calls.length - 1];
    if (responder === undefined) {
      throw new Error(`Unexpected fetch call: ${call.method} ${call.url}`);
    }
    return responder(call);
  }) as unknown as typeof fetch;
  return { fetch: fetchStub, calls };
}

function mintResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    uploadUrl: `https://r2.test/bucket/${objectKey}?X-Amz-Signature=abc`,
    objectKey,
    expiresAt: '2026-07-23T09:20:00.000Z',
    requiredHeaders: { 'content-type': 'image/jpeg' },
    ...overrides,
  });
}

function buildOptions(overrides: Partial<UploadFileOptions> = {}): UploadFileOptions {
  return {
    mediaWorkerUrl,
    accessToken: 'access-token',
    folder: 'gallery',
    file: { data: fileBytes, contentType: 'image/jpeg', byteLength: fileBytes.byteLength },
    ...overrides,
  };
}

describe('uploadFile', () => {
  test('mints a URL, PUTs the bytes, and returns the stored key', async () => {
    const { fetch: fetchStub, calls } = createFetchStub([
      () => mintResponse(),
      () => new Response(null, { status: 200 }),
    ]);

    const result = await uploadFile(buildOptions({ fetchImplementation: fetchStub }));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.objectKey).toBe(objectKey);

    const [mintCall, putCall] = calls;
    expect(mintCall?.url).toBe(`${mediaWorkerUrl}/uploads/url`);
    expect(mintCall?.method).toBe('POST');
    expect(mintCall?.headers.authorization).toBe('Bearer access-token');
    expect(JSON.parse(String(mintCall?.body))).toEqual({
      folder: 'gallery',
      contentType: 'image/jpeg',
      contentLength: fileBytes.byteLength,
    });
    expect(putCall?.method).toBe('PUT');
    expect(putCall?.headers['content-type']).toBe('image/jpeg');
  });

  test('sends exactly the headers the Worker signed, not headers of its own', async () => {
    const { fetch: fetchStub, calls } = createFetchStub([
      () => mintResponse({ requiredHeaders: { 'content-type': 'image/webp' } }),
      () => new Response(null, { status: 200 }),
    ]);
    await uploadFile(buildOptions({ fetchImplementation: fetchStub }));
    expect(calls[1]?.headers['content-type']).toBe('image/webp');
  });

  test('rejects a file the caller mis-declared before any network call happens', async () => {
    const { fetch: fetchStub, calls } = createFetchStub([]);
    const result = await uploadFile(
      buildOptions({
        fetchImplementation: fetchStub,
        file: { data: fileBytes, contentType: 'image/jpeg', byteLength: 50_000_000 },
      }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('UPLOAD-3');
    expect(calls).toHaveLength(0);
  });

  test('surfaces the Worker error code verbatim so the user sees the right message', async () => {
    const { fetch: fetchStub } = createFetchStub([
      () => Response.json({ error: { code: 'UPLOAD-4' } }, { status: 429 }),
    ]);
    const result = await uploadFile(buildOptions({ fetchImplementation: fetchStub }));
    expect(!result.ok && result.error.code).toBe('UPLOAD-4');
  });

  test('reports a rejected transfer as an upload failure, not a generic error', async () => {
    const { fetch: fetchStub } = createFetchStub([
      () => mintResponse(),
      () => new Response(null, { status: 403 }),
    ]);
    const result = await uploadFile(buildOptions({ fetchImplementation: fetchStub }));
    expect(!result.ok && result.error.code).toBe('UPLOAD-5');
  });

  test('reports a lost connection as a network failure', async () => {
    const failingFetch = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const result = await uploadFile(buildOptions({ fetchImplementation: failingFetch }));
    expect(!result.ok && result.error.code).toBe('NETWORK-1');
  });

  test('rejects a mint response that does not match the schema', async () => {
    const { fetch: fetchStub } = createFetchStub([() => Response.json({ uploadUrl: 'nope' })]);
    const result = await uploadFile(buildOptions({ fetchImplementation: fetchStub }));
    expect(!result.ok && result.error.code).toBe('UPLOAD-1');
  });

  test('runs the preparation hook first and uploads what it returns (ADR-013)', async () => {
    const compressed = new Uint8Array(256).fill(9);
    const { fetch: fetchStub, calls } = createFetchStub([
      () => mintResponse(),
      () => new Response(null, { status: 200 }),
    ]);

    await uploadFile(
      buildOptions({
        fetchImplementation: fetchStub,
        prepareFile: async () => ({
          data: compressed,
          contentType: 'image/jpeg',
          byteLength: compressed.byteLength,
        }),
      }),
    );

    expect(JSON.parse(String(calls[0]?.body)).contentLength).toBe(compressed.byteLength);
    expect(calls[1]?.body).toBe(compressed);
  });

  test('never rejects: a thrown preparation hook comes back as a typed failure', async () => {
    const { fetch: fetchStub } = createFetchStub([]);
    const result = await uploadFile(
      buildOptions({
        fetchImplementation: fetchStub,
        prepareFile: async () => {
          throw new TypeError('compression blew up');
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('UPLOAD-1');
  });
});
