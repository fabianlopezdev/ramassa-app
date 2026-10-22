import { describe, expect, test } from 'bun:test';
import { AppError } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';
import { handleMintUploadUrl, type MintUploadUrlDependencies } from './mint-upload-url';
import type { CallerIdentity } from './supabase-identity';

const player: CallerIdentity = {
  userId: '7b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e',
  orgId: '11111111-2222-3333-4444-555555555555',
  role: 'player',
  permissions: new Set(),
  secondFactorVerifiedAt: null,
};

const staff: CallerIdentity = {
  ...player,
  role: 'staff',
  permissions: new Set(['announcements.edit', 'events.edit', 'knowledge.edit', 'services.edit']),
};

function buildRequest(body: unknown): Request {
  return new Request('https://media.example/uploads/url', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function buildDependencies(
  overrides: Partial<MintUploadUrlDependencies> = {},
): MintUploadUrlDependencies {
  return {
    resolveIdentity: async () => player,
    rateLimiter: { limit: async () => ({ success: true }) },
    createUploadTarget: async ({ objectKey, contentType, contentLength }) => ({
      uploadUrl: `https://r2.example/bucket/${objectKey}?signature=deadbeef`,
      requiredHeaders: {
        'content-type': contentType,
        'content-length': String(contentLength),
      },
    }),
    uploadUrlTtlSeconds: 300,
    now: () => new Date('2026-07-23T09:15:00.000Z'),
    ...overrides,
  };
}

const validBody = { folder: 'gallery', contentType: 'image/jpeg', contentLength: 500_000 };

async function readErrorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code ?? '';
}

describe('handleMintUploadUrl - denial paths', () => {
  test('an unauthenticated request is refused with AUTH-2', async () => {
    const response = await handleMintUploadUrl(
      buildRequest(validBody),
      buildDependencies({
        resolveIdentity: async () => {
          throw new AppError('AUTH-2');
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(await readErrorCode(response)).toBe('AUTH-2');
  });

  test('a content type outside the allowlist is refused with UPLOAD-2', async () => {
    const response = await handleMintUploadUrl(
      buildRequest({ ...validBody, contentType: 'application/x-msdownload' }),
      buildDependencies(),
    );
    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toBe('UPLOAD-2');
  });

  test('a file over the cap for its type is refused with UPLOAD-3', async () => {
    const response = await handleMintUploadUrl(
      buildRequest({ ...validBody, contentLength: tokens.upload.maxImageBytes + 1 }),
      buildDependencies(),
    );
    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toBe('UPLOAD-3');
  });

  test('a tripped rate limit is refused with UPLOAD-4 and never signs anything', async () => {
    let signCount = 0;
    const response = await handleMintUploadUrl(
      buildRequest(validBody),
      buildDependencies({
        rateLimiter: { limit: async () => ({ success: false }) },
        createUploadTarget: async () => {
          signCount += 1;
          return { uploadUrl: 'https://r2.example/x', requiredHeaders: {} };
        },
      }),
    );
    expect(response.status).toBe(429);
    expect(await readErrorCode(response)).toBe('UPLOAD-4');
    expect(signCount).toBe(0);
  });

  test('the rate limit is keyed per user, not globally', async () => {
    const seenKeys: string[] = [];
    await handleMintUploadUrl(
      buildRequest(validBody),
      buildDependencies({
        rateLimiter: {
          limit: async ({ key }) => {
            seenKeys.push(key);
            return { success: true };
          },
        },
      }),
    );
    expect(seenKeys).toEqual([player.userId]);
  });

  test('a player writing to a staff-only folder is refused with AUTH-3', async () => {
    const response = await handleMintUploadUrl(
      buildRequest({ ...validBody, folder: 'documents' }),
      buildDependencies(),
    );
    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toBe('AUTH-3');
  });

  test('a holder of settings.documents may write to documents', async () => {
    const response = await handleMintUploadUrl(
      buildRequest({ ...validBody, folder: 'documents', contentType: 'application/pdf' }),
      buildDependencies({
        resolveIdentity: async () => ({ ...staff, permissions: new Set(['settings.documents']) }),
      }),
    );
    expect(response.status).toBe(200);
  });

  test('staff without settings.documents may not (RAPP-230 decision, RAPP-233)', async () => {
    const response = await handleMintUploadUrl(
      buildRequest({ ...validBody, folder: 'documents', contentType: 'application/pdf' }),
      buildDependencies({ resolveIdentity: async () => staff }),
    );
    expect(response.status).toBe(403);
    expect(await readErrorCode(response)).toBe('AUTH-3');
  });

  test('only a holder of equipment.receive may write arrival photos (RAPP-250)', async () => {
    const receiver = await handleMintUploadUrl(
      buildRequest({ ...validBody, folder: 'stock' }),
      buildDependencies({
        resolveIdentity: async () => ({ ...staff, permissions: new Set(['equipment.receive']) }),
      }),
    );
    const coach = await handleMintUploadUrl(
      buildRequest({ ...validBody, folder: 'stock' }),
      buildDependencies({
        resolveIdentity: async () => ({ ...staff, permissions: new Set(['equipment.handover']) }),
      }),
    );
    expect(receiver.status).toBe(200);
    expect(coach.status).toBe(403);
  });

  test('a malformed JSON body is refused with VALIDATION-1', async () => {
    const response = await handleMintUploadUrl(buildRequest('{not json'), buildDependencies());
    expect(response.status).toBe(400);
    expect(await readErrorCode(response)).toBe('VALIDATION-1');
  });

  test('a non-POST method is refused', async () => {
    const response = await handleMintUploadUrl(
      new Request('https://media.example/uploads/url', { method: 'GET' }),
      buildDependencies(),
    );
    expect(response.status).toBe(405);
  });
});

describe('handleMintUploadUrl - success path', () => {
  test('returns a signed URL, a server-generated key, the required headers and an expiry', async () => {
    const response = await handleMintUploadUrl(buildRequest(validBody), buildDependencies());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      uploadUrl: string;
      objectKey: string;
      expiresAt: string;
      requiredHeaders: Record<string, string>;
    };
    expect(body.objectKey).toStartWith(`${player.orgId}/gallery/${player.userId}/2026/07/`);
    expect(body.uploadUrl).toContain(body.objectKey);
    expect(body.requiredHeaders['content-type']).toBe('image/jpeg');
    expect(body.expiresAt).toBe('2026-07-23T09:20:00.000Z');
  });

  test('ignores an object key supplied by the client', async () => {
    const response = await handleMintUploadUrl(
      buildRequest({ ...validBody, objectKey: '../../someone-else/photo.jpg' }),
      buildDependencies(),
    );
    const body = (await response.json()) as { objectKey: string };
    expect(body.objectKey).not.toContain('..');
    expect(body.objectKey).toStartWith(player.orgId);
  });

  test('signs the size and type the caller declared, so R2 can enforce them', async () => {
    let signedWith: { contentType: string; contentLength: number } | undefined;
    await handleMintUploadUrl(
      buildRequest(validBody),
      buildDependencies({
        createUploadTarget: async (target) => {
          signedWith = { contentType: target.contentType, contentLength: target.contentLength };
          return { uploadUrl: 'https://r2.example/x', requiredHeaders: {} };
        },
      }),
    );
    expect(signedWith).toEqual({ contentType: 'image/jpeg', contentLength: 500_000 });
  });
});

describe('handleMintUploadUrl - a woman with no profile yet (RAPP-610)', () => {
  const selfStarted: CallerIdentity = {
    userId: '0b1d9c2e-3f4a-4b5c-8d6e-9f0a1b2c3d4f',
    orgId: '5eed0000-0000-4000-8000-000000000000',
    role: 'invited',
    permissions: new Set(),
    secondFactorVerifiedAt: null,
    withoutProfile: true,
  };
  const answerFile = {
    folder: 'intake-answers',
    contentType: 'application/pdf',
    contentLength: 2048,
  };

  test('uploads an answer file into her own folder of the organization she registers in', async () => {
    const response = await handleMintUploadUrl(
      buildRequest(answerFile),
      buildDependencies({ resolveIdentity: async () => selfStarted }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { objectKey: string };
    expect(
      body.objectKey.startsWith(`${selfStarted.orgId}/intake-answers/${selfStarted.userId}/`),
    ).toBe(true);
  });

  test('every other folder still needs a profile', async () => {
    for (const folder of ['gallery', 'profile-photos', 'documents']) {
      const response = await handleMintUploadUrl(
        buildRequest({ folder, contentType: 'image/jpeg', contentLength: 2048 }),
        buildDependencies({ resolveIdentity: async () => selfStarted }),
      );
      expect(response.status).toBe(401);
      expect(await readErrorCode(response)).toBe('AUTH-2');
    }
  });

  test('the same size and type limits apply', async () => {
    const response = await handleMintUploadUrl(
      buildRequest({ ...answerFile, contentType: 'application/x-msdownload' }),
      buildDependencies({ resolveIdentity: async () => selfStarted }),
    );
    expect(response.status).toBe(400);
  });
});
