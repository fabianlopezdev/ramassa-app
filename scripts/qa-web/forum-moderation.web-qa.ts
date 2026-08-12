import { expect, test } from '@playwright/test';
import { queryDatabase, signIn, STAFF_EMAIL } from './session';

const seededPostId = '5eed0000-0000-4000-8010-000000000001';
const seededFlagId = '5eed0000-0000-4000-8012-000000000099';
const softBanParticipantId = '5eed0000-0000-4000-8000-000000000012';
const qaCategorySlug = 'rapp51-qa';

test.setTimeout(180_000);

test.afterAll(() => {
  queryDatabase(`
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
