import { createClient } from '@supabase/supabase-js';
import { createMediaItem, setMediaItemPrivacy } from '@ramassa/shared/media';
import { buildMediaObjectUrl, deleteMediaItem, uploadFile } from '@ramassa/shared/upload-client';
import type { Database } from '../packages/shared/types/database';

const supabaseUrl = 'http://127.0.0.1:54321';
const publishableKey = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const mediaWorkerUrl = process.env.RAPP52_MEDIA_WORKER_URL ?? 'http://127.0.0.1:8792';
const client = createClient<Database>(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await client.auth.signInWithPassword({
  email: 'amina.alhassan@example.test',
  password: 'ramassa-dev-password',
});
if (error !== null || data.session === null) throw error ?? new Error('No session');
const token = data.session.access_token;
const otherClient = createClient<Database>(supabaseUrl, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: otherData, error: otherError } = await otherClient.auth.signInWithPassword({
  email: 'fatima.zahra@example.test',
  password: 'ramassa-dev-password',
});
if (otherError !== null || otherData.session === null) {
  throw otherError ?? new Error('No second player session');
}
const otherToken = otherData.session.access_token;
const image = new Uint8Array([255, 216, 255, 217]);

async function upload() {
  const result = await uploadFile({
    mediaWorkerUrl,
    accessToken: token,
    folder: 'gallery',
    file: { data: image, contentType: 'image/jpeg', byteLength: image.byteLength },
  });
  if (!result.ok) throw result.error;
  return result.value.objectKey;
}

const fileObjectKey = await upload();
const thumbnailObjectKey = await upload();
const mediaItemId = await createMediaItem(client, {
  fileObjectKey,
  thumbnailObjectKey,
  fileType: 'image',
  fileSize: image.byteLength,
  caption: 'RAPP-52 deletion integration proof',
  privacyLevel: 'staff_only',
  consentAcknowledged: true,
  consentVersion: 'gallery-consent-v1',
});

for (const key of [fileObjectKey, thumbnailObjectKey]) {
  const response = await fetch(buildMediaObjectUrl(mediaWorkerUrl, key), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Object was not readable before deletion: ${key}`);

  const deniedResponse = await fetch(buildMediaObjectUrl(mediaWorkerUrl, key), {
    headers: { authorization: `Bearer ${otherToken}` },
  });
  if (deniedResponse.status !== 404) {
    throw new Error(`Staff-only object was readable by another player: ${key}`);
  }
}

await setMediaItemPrivacy(client, mediaItemId, 'community');
for (const key of [fileObjectKey, thumbnailObjectKey]) {
  const response = await fetch(buildMediaObjectUrl(mediaWorkerUrl, key), {
    headers: { authorization: `Bearer ${otherToken}` },
  });
  if (!response.ok) throw new Error(`Community object was not readable by another player: ${key}`);
}

const deleted = await deleteMediaItem({ mediaWorkerUrl, accessToken: token, mediaItemId });
if (!deleted.ok) throw deleted.error;
const { data: row, error: rowError } = await client
  .from('media_items')
  .select('id')
  .eq('id', mediaItemId)
  .maybeSingle();
if (rowError !== null || row !== null) throw rowError ?? new Error('Row still exists');

for (const key of [fileObjectKey, thumbnailObjectKey]) {
  const response = await fetch(buildMediaObjectUrl(mediaWorkerUrl, key), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (response.status !== 404) throw new Error(`Object still exists after deletion: ${key}`);
}

console.log(
  JSON.stringify({
    mediaItemId,
    staffOnlyDeniedToSecondPlayer: true,
    communityVisibleToSecondPlayer: true,
    rowDeleted: true,
    objectsDeleted: 2,
  }),
);
