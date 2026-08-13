import { expect, test } from '@playwright/test';
import {
  accessTokenFor,
  MEDIA_WORKER_URL,
  queryDatabase,
  SEED_PASSWORD,
  signIn,
  STAFF_EMAIL,
  uploadObjectAs,
} from './session';

const seededPostId = '5eed0000-0000-4000-8010-000000000001';
const seededFlagId = '5eed0000-0000-4000-8012-000000000099';
const softBanParticipantId = '5eed0000-0000-4000-8000-000000000012';
const qaCategorySlug = 'rapp51-qa';
const mediaId = '5eed0000-0000-4000-8014-000000000098';

test.setTimeout(180_000);

test.afterAll(() => {
  queryDatabase(`
    delete from public.media_items where id = '${mediaId}';
    update public.forum_posts
    set category_id = '5eed0000-0000-4000-8006-000000000002',
        is_pinned = true,
        visibility = 'visible',
        flag_count = 1
    where id = '${seededPostId}';
    update public.forum_flags
    set state = 'pending', reviewed_by = null, reviewed_at = null
    where id = '${seededFlagId}';
    update public.profiles set is_forum_banned = false where id = '${softBanParticipantId}';
    delete from public.forum_categories where slug in ('${qaCategorySlug}', '${qaCategorySlug}-edited');
  `);
});

test('staff sees flagged gallery media and deletes its row and R2 object', async ({ page }) => {
  const playerToken = await accessTokenFor('amina.alhassan@example.test', SEED_PASSWORD);
  const { objectKey } = await uploadObjectAs(
    playerToken,
    new Uint8Array([255, 216, 255, 217]),
    'gallery',
  );
  queryDatabase(`
    insert into public.media_items (
      id, org_id, uploaded_by, uploader_first_name, file_url, thumbnail_url,
      file_type, file_size, caption, privacy_level, moderation_state, flag_count,
      consent_acknowledged_at, consent_version
    ) values (
      '${mediaId}', '5eed0000-0000-4000-8000-000000000000',
      '5eed0000-0000-4000-8000-000000000011', 'Amina', '${objectKey}', '${objectKey}',
      'image', 4, 'RAPP-52 gallery moderation QA', 'community', 'hidden_pending_review', 3,
      now(), 'gallery-consent-v1'
    );
    alter table public.forum_flags disable trigger forum_flags_set_context;
    alter table public.forum_flags disable trigger forum_flags_apply;
    insert into public.forum_flags (
      org_id, flagger_id, target_type, media_id, reason, state
    ) values
      ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000014', 'media', '${mediaId}', 'privacy', 'pending'),
      ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000015', 'media', '${mediaId}', 'privacy', 'pending'),
      ('5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8000-000000000016', 'media', '${mediaId}', 'privacy', 'pending');
    alter table public.forum_flags enable trigger forum_flags_set_context;
    alter table public.forum_flags enable trigger forum_flags_apply;
  `);

  await signIn(page, STAFF_EMAIL);
  await page.goto('/forum');
  const mediaItem = page.getByRole('listitem').filter({ hasText: 'RAPP-52 gallery moderation QA' });
  await expect(mediaItem).toBeVisible();
  await expect(mediaItem.getByRole('img')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await mediaItem.getByRole('button', { name: /delete|elimina/i }).click();
  await expect(mediaItem).toHaveCount(0);
  expect(queryDatabase(`select count(*) from public.media_items where id = '${mediaId}'`)).toBe(
    '0',
  );
  const objectResponse = await fetch(
    `${MEDIA_WORKER_URL}/objects/${objectKey.split('/').map(encodeURIComponent).join('/')}`,
    { headers: { authorization: `Bearer ${playerToken}` } },
  );
  expect(objectResponse.status).toBe(404);
});

test('staff reviews a flag, manages its post, and restores it after dismissal', async ({
  page,
}) => {
  await signIn(page, STAFF_EMAIL);

  await page.goto(`/participants/${softBanParticipantId}`);
  await page.getByRole('button', { name: /disable forum posting|desactiva publicacions/i }).click();
  await expect
    .poll(() =>
      queryDatabase(
        `select is_forum_banned::text from public.profiles where id = '${softBanParticipantId}'`,
      ),
    )
    .toBe('true');
  await page.getByRole('button', { name: /enable forum posting|activa publicacions/i }).click();
  await expect
    .poll(() =>
      queryDatabase(
        `select is_forum_banned::text from public.profiles where id = '${softBanParticipantId}'`,
      ),
    )
    .toBe('false');

  await page.goto('/forum');

  await expect(
    page.getByRole('heading', { name: /forum moderation|moderació del fòrum/i }),
  ).toBeVisible();

  await page.getByLabel(/name \(ca\)|nom \(ca\)/i).fill('QA RAPP-51');
  await page.getByLabel(/name \(es\)|nom \(es\)/i).fill('QA RAPP-51');
  await page.getByLabel(/name \(en\)|nom \(en\)/i).fill('QA RAPP-51');
  await page.getByLabel(/name \(ar\)|nom \(ar\)/i).fill('اختبار');
  await page.getByLabel(/name \(fa\)|nom \(fa\)/i).fill('آزمایش');
  await page.getByLabel(/identifier|identificador/i).fill(qaCategorySlug);
  await page.getByLabel(/icon|icona/i).fill('message-circle');
  await page.getByLabel(/color/i).fill('primary');
  await page.locator('input[type="number"]').fill('91');
  await page.getByRole('button', { name: /create category|crea la categoria/i }).click();
  await expect
    .poll(() =>
      queryDatabase(`select slug from public.forum_categories where slug = '${qaCategorySlug}'`),
    )
    .toBe(qaCategorySlug);

  const categoryItem = page.getByRole('listitem').filter({ hasText: qaCategorySlug });
  await categoryItem.getByRole('button', { name: /edit|edita/i }).click();
  await page.getByLabel(/identifier|identificador/i).fill(`${qaCategorySlug}-edited`);
  await page.getByRole('button', { name: /save category|desa la categoria/i }).click();
  await expect
    .poll(() =>
      queryDatabase(
        `select slug from public.forum_categories where slug = '${qaCategorySlug}-edited'`,
      ),
    )
    .toBe(`${qaCategorySlug}-edited`);
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByRole('listitem')
    .filter({ hasText: `${qaCategorySlug}-edited` })
    .getByRole('button', { name: /delete|esborra/i })
    .click();
  await expect
    .poll(() =>
      queryDatabase(
        `select count(*) from public.forum_categories where slug like '${qaCategorySlug}%'`,
      ),
    )
    .toBe('0');

  const flaggedItem = page.getByRole('listitem').filter({ hasText: 'Em fa sentir insegura.' });
  await expect(flaggedItem).toBeVisible();

  await flaggedItem.getByRole('button', { name: /unpin|deixa de destacar/i }).click();
  await expect
    .poll(() =>
      queryDatabase(`select is_pinned::text from public.forum_posts where id = '${seededPostId}'`),
    )
    .toBe('false');

  await flaggedItem.getByRole('combobox').selectOption('5eed0000-0000-4000-8006-000000000003');
  await expect
    .poll(() =>
      queryDatabase(`select category_id from public.forum_posts where id = '${seededPostId}'`),
    )
    .toBe('5eed0000-0000-4000-8006-000000000003');

  await flaggedItem.getByRole('button', { name: /contact author|contacta l'autora/i }).click();
  await expect(page).toHaveURL(/\/messages\/[0-9a-f-]+/);

  await page.goto('/forum');
  const restoredItem = page.getByRole('listitem').filter({ hasText: 'Em fa sentir insegura.' });
  await restoredItem.getByRole('button', { name: /dismiss reports|descarta avisos/i }).click();
  await expect(restoredItem).toHaveCount(0);
  expect(
    queryDatabase(
      `select visibility || ':' || flag_count::text from public.forum_posts where id = '${seededPostId}'`,
    ),
  ).toBe('visible:0');
  expect(queryDatabase(`select state from public.forum_flags where id = '${seededFlagId}'`)).toBe(
    'dismissed',
  );
});
