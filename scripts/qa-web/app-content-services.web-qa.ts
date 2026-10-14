/**
 * The services directory in the app (RAPP-344), through the web build: a paid
 * leisure service with its category's extra fields and one photo is published
 * only once the title and the photo description are approved, and is stored
 * with the amount, the extra fields, the uploaded photo and five languages. An
 * edit takes it back to draft and marks it full. Expected values come from the
 * database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function openServices(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page.getByTestId('content-kind-services').click({ timeout: 30_000 });
  await expect(page.getByTestId('content-services-total')).toBeVisible({ timeout: 30_000 });
}

test('a leisure service is published with its extra fields and a photo, then edited', async ({
  page,
}) => {
  const tag = `app${Date.now().toString(36)}`;
  const title = `Taller ${tag}`;
  try {
    await openServices(page);
    await page.getByTestId('content-service-new').click();
    await page.getByTestId('service-category-leisure-culture').click();
    await page.getByTestId('service-title-source').fill(title);
    await page.getByTestId('service-cost-paid').click();
    await page.getByTestId('service-costAmount').fill('12,5');
    await page.getByTestId('service-contactEmail').fill('teatre@example.test');
    await page.getByTestId('service-metadata-activity_type-cultural').click();
    await page.getByTestId('service-metadata-family_friendly').click();
    await page.getByTestId('service-metadata-age_restriction').fill('16');

    await page.getByTestId('service-image-add').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('service-image-choose-0').click();
    await (await chooser).setFiles({ name: `${tag}.png`, mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('service-image-alt-0-source').fill('Escenari del teatre');
    await page.getByTestId('service-mode-now').click();

    // Publishing before approving is refused at the button.
    await page.getByRole('button', { name: 'Save service', exact: true }).click();
    await expect(
      page.getByText('Generate and approve every translation before publishing.'),
    ).toBeVisible();

    await page.getByTestId('service-generate').click();
    await expect(page.getByTestId('service-title-draft-es')).toHaveValue(`[es] ${title}`, {
      timeout: 30_000,
    });
    await page.getByTestId('service-title-approve-all').click();
    await page.getByTestId('service-image-alt-0-approve-all').click();
    await page.getByRole('button', { name: 'Save service', exact: true }).click();

    await expect
      .poll(
        () =>
          queryDatabase(`
            select s.status || '|' || s.cost_amount::float || '|' || (s.metadata ->> 'activity_type') ||
                   '|' || (s.metadata ->> 'family_friendly') || '|' ||
                   (s.metadata ->> 'age_restriction') || '|' ||
                   (select count(*) from jsonb_object_keys(s.title))
              from public.services s where s.title ->> 'ca' = '${title}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe('published|12.5|cultural|true|16|5');
    expect(
      queryDatabase(`
        select split_part(i.url, '/', 2) || '|' || (i.alt_text ->> 'fa') || '|' || i.position
          from public.service_images i join public.services s on s.id = i.service_id
         where s.title ->> 'ca' = '${title}';
      `).trim(),
    ).toBe('services|[fa] Escenari del teatre|0');

    const id = queryDatabase(
      `select id from public.services where title ->> 'ca' = '${title}';`,
    ).trim();
    await page.getByTestId(`content-service-${id}`).click();
    await expect(page.getByTestId('service-detail-metadata')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('service-edit').click();
    await page.getByTestId('service-availability-full').click();
    await page.getByTestId('service-mode-draft').click();
    await page.getByRole('button', { name: 'Save service', exact: true }).click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select status || '|' || availability from public.services where id = '${id}';`,
          ).trim(),
        { timeout: 30_000 },
      )
      .toBe('draft|full');
  } finally {
    queryDatabase(`delete from public.services where title ->> 'ca' = '${title}';`);
  }
});
