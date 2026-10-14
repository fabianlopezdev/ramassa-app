/**
 * Service categories in the app (RAPP-347), through the web build: a category
 * is built on the phone with a select field and a number field, reordered, and
 * stored with five languages and the same schema shape the web admin writes.
 * A required new field on a category that already has services is refused
 * with the count of services it would break, and the category is unchanged. A
 * category is deleted. Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

async function openCategories(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page.getByTestId('content-kind-services').click({ timeout: 30_000 });
  await page.getByTestId('content-service-categories').click({ timeout: 30_000 });
  await expect(page.getByTestId('service-category-new')).toBeVisible({ timeout: 30_000 });
}

async function addField(
  page: Page,
  label: string,
  type: string,
  extra: (page: Page) => Promise<void>,
): Promise<void> {
  await page.getByTestId('service-category-field-add').click();
  await page.getByTestId('service-field-label-source').fill(label);
  await page.getByTestId('service-field-generate').click();
  await expect(page.getByTestId('service-field-label-draft-es')).toHaveValue(`[es] ${label}`, {
    timeout: 30_000,
  });
  await page.getByTestId('service-field-label-approve-all').click();
  await page.getByTestId(`service-field-type-${type}`).click();
  await extra(page);
  await page.getByTestId('service-field-done').click();
}

test('a category is built with its fields on the phone, then deleted', async ({ page }) => {
  const tag = `app${Date.now().toString(36)}`;
  const name = `Esports ${tag}`;
  const slug = `esports-${tag}`;
  try {
    await openCategories(page);
    await page.getByTestId('service-category-new').click();
    await page.getByTestId('service-category-name-source').fill(name);
    await expect(page.getByTestId('service-category-slug')).toHaveValue(slug);
    await page.getByTestId('service-category-generate').click();
    await expect(page.getByTestId('service-category-name-draft-es')).toHaveValue(`[es] ${name}`, {
      timeout: 30_000,
    });
    await page.getByTestId('service-category-name-approve-all').click();
    await page.getByTestId('service-category-icon-tickets').click();
    await page.getByTestId('service-category-color-accent').click();

    await addField(page, 'Nivell', 'select', async (sheet) => {
      await sheet.getByTestId('service-field-option-add').click();
      await sheet.getByTestId('service-field-option-0').fill('beginner');
      await sheet.getByTestId('service-field-option-add').click();
      await sheet.getByTestId('service-field-option-1').fill('advanced');
      await sheet.getByTestId('service-field-required').click();
    });
    await addField(page, 'Places', 'number', async (sheet) => {
      await sheet.getByTestId('service-field-minimum').fill('1');
    });
    await page.getByTestId('service-category-field-1-up').click();
    await page.getByRole('button', { name: 'Save category', exact: true }).click();

    await expect
      .poll(
        () =>
          queryDatabase(`
            select icon || '|' || color || '|' || (select count(*) from jsonb_object_keys(name)) || '|' ||
                   (select string_agg(f ->> 'key', ',') from jsonb_array_elements(metadata_schema -> 'fields') f) || '|' ||
                   (metadata_schema -> 'fields' -> 0 ->> 'minimum') || '|' ||
                   (metadata_schema -> 'fields' -> 1 ->> 'required') || '|' ||
                   (metadata_schema -> 'fields' -> 1 -> 'options')::text || '|' ||
                   (metadata_schema -> 'fields' -> 1 -> 'label' ->> 'fa')
              from public.service_categories where slug = '${slug}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe('tickets|accent|5|places,nivell|1|true|["beginner", "advanced"]|[fa] Nivell');

    const id = queryDatabase(
      `select id from public.service_categories where slug = '${slug}';`,
    ).trim();
    await expect(page.getByTestId(`service-category-row-${id}`)).toBeVisible({ timeout: 30_000 });
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId(`service-category-delete-${id}`).click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select count(*) from public.service_categories where id = '${id}';`,
          ).trim(),
        { timeout: 30_000 },
      )
      .toBe('0');
  } finally {
    queryDatabase(`delete from public.service_categories where slug = '${slug}';`);
  }
});

test('a required new field that stored services lack is refused with their count', async ({
  page,
}) => {
  const before = queryDatabase(
    `select metadata_schema::text from public.service_categories where slug = 'housing';`,
  ).trim();
  const services = queryDatabase(`
    select count(*) from public.services s join public.service_categories c on c.id = s.category_id
     where c.slug = 'housing';
  `).trim();
  const id = queryDatabase(
    `select id from public.service_categories where slug = 'housing';`,
  ).trim();
  await openCategories(page);
  await page.getByTestId(`service-category-edit-${id}`).click();
  await page.getByTestId('service-category-name-approve-all').click({ timeout: 30_000 });
  await addField(page, 'Ascensor', 'boolean', async (sheet) => {
    await sheet.getByTestId('service-field-required').click();
  });
  await page.getByRole('button', { name: 'Save category', exact: true }).click();
  await expect(
    page.getByText(
      `This schema is incompatible with ${services} existing services. Update those services first.`,
    ),
  ).toBeVisible({ timeout: 30_000 });
  expect(
    queryDatabase(
      `select metadata_schema::text from public.service_categories where slug = 'housing';`,
    ).trim(),
  ).toBe(before);
});
