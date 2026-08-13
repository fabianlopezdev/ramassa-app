import { describe, expect, test } from 'bun:test';
import {
  createMediaItem,
  fetchMediaItem,
  fetchMediaItems,
  mediaItemInputSchema,
  setMediaItemPrivacy,
} from './media';
import { tokens } from './tokens';

const mediaId = '5eed0000-0000-4000-8014-000000000001';
const objectKey =
  '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/33333333333333333333333333333333.jpg';
const thumbnailKey =
  '5eed0000-0000-4000-8000-000000000000/gallery/5eed0000-0000-4000-8000-000000000011/2026/08/44444444444444444444444444444444.jpg';

const validInput = {
  fileObjectKey: objectKey,
  thumbnailObjectKey: thumbnailKey,
  fileType: 'image',
  fileSize: 640_000,
  caption: '  Primer entrenament  ',
  privacyLevel: 'community',
  consentAcknowledged: true,
  consentVersion: 'gallery-consent-v1',
} as const;

const row = {
  id: mediaId,
  org_id: '5eed0000-0000-4000-8000-000000000000',
  uploaded_by: '5eed0000-0000-4000-8000-000000000011',
  uploader_first_name: 'Amina',
  file_url: objectKey,
  thumbnail_url: thumbnailKey,
  file_type: 'image',
  file_size: 640_000,
  caption: 'Primer entrenament',
  privacy_level: 'community',
  moderation_state: 'visible',
  flag_count: 0,
  consent_acknowledged_at: '2026-08-12T20:00:00.000Z',
  consent_version: 'gallery-consent-v1',
  created_at: '2026-08-12T20:00:00.000Z',
  updated_at: '2026-08-12T20:00:00.000Z',
} as const;

describe('media item validation', () => {
  test('requires the translated consent acknowledgment and records its version', () => {
    expect(mediaItemInputSchema.parse(validInput)).toMatchObject({
      caption: 'Primer entrenament',
      consentAcknowledged: true,
      consentVersion: 'gallery-consent-v1',
    });
    expect(
      mediaItemInputSchema.safeParse({ ...validInput, consentAcknowledged: false }).success,
    ).toBe(false);
  });

  test('enforces the strict 10MB video cap at the shared boundary', () => {
    expect(
      mediaItemInputSchema.safeParse({
        ...validInput,
        fileType: 'video',
        fileSize: tokens.upload.maxVideoBytes,
      }).success,
    ).toBe(true);
    expect(
      mediaItemInputSchema.safeParse({
        ...validInput,
        fileType: 'video',
        fileSize: tokens.upload.maxVideoBytes + 1,
      }).success,
    ).toBe(false);
  });

  test('rejects external URLs and keys outside the gallery folder', () => {
    expect(
      mediaItemInputSchema.safeParse({ ...validInput, fileObjectKey: 'https://evil.test/a.jpg' })
        .success,
    ).toBe(false);
    expect(
      mediaItemInputSchema.safeParse({
        ...validInput,
        fileObjectKey: objectKey.replace('/gallery/', '/forum/'),
      }).success,
    ).toBe(false);
    expect(
      mediaItemInputSchema.safeParse({
        ...validInput,
        fileObjectKey: objectKey.replace(
          '33333333333333333333333333333333.jpg',
          'guessable-name.jpg',
        ),
      }).success,
    ).toBe(false);
  });
});

describe('media data boundaries', () => {
  test('fetches the gallery and an item with cancellation and stable order', async () => {
    const calls: unknown[] = [];
    const listQuery = {
      order(column: string, options: unknown) {
        calls.push(['order', column, options]);
        return this;
      },
      abortSignal(signal: AbortSignal) {
        calls.push(['abortSignal', signal]);
        return this;
      },
      then(resolve: (value: unknown) => void) {
        resolve({ data: [row], error: null });
      },
    };
    const singleQuery = {
      eq(column: string, value: unknown) {
        calls.push(['eq', column, value]);
        return this;
      },
      abortSignal(signal: AbortSignal) {
        calls.push(['abortSignal', signal]);
        return this;
      },
      async single() {
        return { data: row, error: null };
      },
    };
    let selectCount = 0;
    const client = {
      from(table: string) {
        calls.push(['from', table]);
        return {
          select(columns: string) {
            calls.push(['select', columns]);
            selectCount += 1;
            return selectCount === 1 ? listQuery : singleQuery;
          },
        };
      },
    };
    const signal = new AbortController().signal;

    await expect(fetchMediaItems(client as never, { signal })).resolves.toEqual([row]);
    await expect(fetchMediaItem(client as never, mediaId, { signal })).resolves.toEqual(row);
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(calls).toContainEqual(['order', 'id', { ascending: false }]);
    expect(calls).toContainEqual(['eq', 'id', mediaId]);
    expect(calls.filter((call) => (call as unknown[])[0] === 'abortSignal')).toHaveLength(2);
  });

  test('creates media and edits privacy only through validated RPCs', async () => {
    const calls: unknown[] = [];
    const client = {
      async rpc(name: string, args: unknown) {
        calls.push([name, args]);
        return { data: name === 'create_media_item' ? mediaId : null, error: null };
      },
    };

    await expect(createMediaItem(client as never, validInput)).resolves.toBe(mediaId);
    await setMediaItemPrivacy(client as never, mediaId, 'staff_only');
    expect(calls).toEqual([
      [
        'create_media_item',
        {
          p_file_url: objectKey,
          p_thumbnail_url: thumbnailKey,
          p_file_type: 'image',
          p_file_size: 640_000,
          p_caption: 'Primer entrenament',
          p_privacy_level: 'community',
          p_consent_acknowledged: true,
          p_consent_version: 'gallery-consent-v1',
        },
      ],
      ['set_media_item_privacy', { p_media_item_id: mediaId, p_privacy_level: 'staff_only' }],
    ]);
  });
});
