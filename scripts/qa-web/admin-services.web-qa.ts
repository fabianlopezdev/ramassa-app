/**
 * Staff service and category administration through the real browser, local
 * Workers, and Postgres. Expected contracts and list counts come from the
 * database, independently of the UI.
 */

import { expect, test, type Page } from '@playwright/test';
import { ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

interface DatabaseField {
  readonly key: string;
  readonly type: 'select' | 'string-array' | 'boolean' | 'number' | 'text' | 'date';
  readonly required: boolean;
  readonly options?: readonly string[];
}

interface DatabaseCategory {
  readonly id: string;
  readonly slug: string;
  readonly metadata_schema: { readonly fields: readonly DatabaseField[] };
}

const RUN_TAG = `rapp42${Date.now().toString(36)}`;
const createdServiceIds: string[] = [];
const createdCategoryIds: string[] = [];

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function databaseCategories(): readonly DatabaseCategory[] {
  const raw = queryDatabase(
    `select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'metadata_schema', metadata_schema) order by sort_order, id)::text from public.service_categories`,
  );
  return JSON.parse(raw) as readonly DatabaseCategory[];
}

function rememberService(title: string): string {
  const id = queryDatabase(
    `select id from public.services where title->>'ca' = ${sqlLiteral(title)} order by created_at desc limit 1`,
  );
  if (id.length === 0) throw new Error(`Service was not stored: ${title}`);
  if (!createdServiceIds.includes(id)) createdServiceIds.push(id);
  return id;
}

test.afterAll(() => {
  if (createdServiceIds.length > 0) {
    queryDatabase(
      `delete from public.services where id in (${createdServiceIds.map(sqlLiteral).join(',')})`,
    );
  }
  if (createdCategoryIds.length > 0) {
    queryDatabase(
      `delete from public.service_categories where id in (${createdCategoryIds.map(sqlLiteral).join(',')})`,
    );
  }
});

async function fillRequiredMetadata(page: Page, category: DatabaseCategory) {
  for (const field of category.metadata_schema.fields) {
    const control = page.getByTestId(`service-metadata-${field.key}`);
    await expect(control).toBeVisible();
    if (!field.required) continue;
    if (field.type === 'select') await control.selectOption(field.options?.[0] ?? '');
    if (field.type === 'string-array') {
      await page.getByTestId(`service-metadata-${field.key}-${field.options?.[0] ?? ''}`).check();
    }
    if (field.type === 'number') await control.fill('3');
    if (field.type === 'text') await control.fill(`Valor Àgora ${RUN_TAG}`);
    if (field.type === 'date') await control.fill('2026-10-03');
  }
}

async function approveExistingTitle(page: Page) {
  await expect(page.getByTestId('service-title-draft-es')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('service-title-approve-all').click();
}

test.describe.serial('services administration across database categories', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  test('creates, translates, schedules, filters, reopens, edits, and publishes all eight categories', async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const categories = databaseCategories();
    expect(categories).toHaveLength(8);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

    for (const [index, category] of categories.entries()) {
      await page.goto('/content/services/new');
      await expect(page.getByTestId('service-editor')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('service-category').selectOption(category.id);
      await expect(page.getByTestId(/^service-metadata-field-/)).toHaveCount(
        category.metadata_schema.fields.length,
      );
      const title = `${RUN_TAG} ${category.slug} <b>${index}</b>`;
      const half = title.slice(0, Math.ceil(title.length / 2));
      await page.getByTestId('service-title-source').fill(half);
      await expect(page.getByTestId('service-title-source')).toHaveValue(half);
      await page.getByTestId('service-title-source').fill(title);
      const provider = `Associació Àgora <script>alert(${index})</script> Наталія`;
      await page.getByTestId('service-provider').fill(provider);
      await fillRequiredMetadata(page, category);
      await page.getByTestId('service-mode').selectOption('scheduled');
      await page.getByTestId('service-published-at').fill(future);
      await page.getByTestId('service-generate-translations').click();
      await expect(page.getByTestId('service-title-draft-es')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('service-title-approve-all').click();
      await page.getByTestId('service-save').click();
      await expect(page).toHaveURL(/\/content\/services(?:\?.*)?$/, { timeout: 30_000 });
      const id = rememberService(title);

      expect(
        queryDatabase(
          `select status || '|' || (published_at > now())::text || '|' || (select count(*) from jsonb_object_keys(s.title)) || '|' || provider_name from public.services s where id = ${sqlLiteral(id)}`,
        ),
      ).toBe(`published|true|5|${provider}`);

      await page.getByTestId('service-category-filter').selectOption(category.id);
      await page.getByTestId('service-status-filter').selectOption('scheduled');
      await expect(page).toHaveURL(/[?&]status=scheduled(?:&|$)/);
      const expectedScheduled = Number(
        queryDatabase(
          `select count(*) from public.services where category_id = ${sqlLiteral(category.id)} and status = 'published' and published_at > now()`,
        ),
      );
      await expect(page.locator('tbody tr')).toHaveCount(expectedScheduled);
      await page.getByTestId(`service-link-${id}`).click();
      await expect(page.getByTestId('service-title-source')).toHaveValue(title);
      await expect(page.getByTestId('service-provider')).toHaveValue(provider);
      await page.reload();
      await expect(page.getByTestId('service-provider')).toHaveValue(provider);
      await page.goBack();
      await expect(page.getByTestId('service-category-filter')).toHaveValue(category.id);
      await expect(page.getByTestId('service-status-filter')).toHaveValue('scheduled');
      await page.getByTestId(`service-link-${id}`).click();
      await approveExistingTitle(page);
      await page.getByTestId('service-provider').fill(`${provider} editat`);
      await page.getByTestId('service-mode').selectOption('now');
      await page.getByTestId('service-save').click();
      await expect(page).toHaveURL(/\/content\/services(?:\?.*)?$/, { timeout: 30_000 });
      await page.getByTestId('service-category-filter').selectOption(category.id);
      await page.getByTestId('service-status-filter').selectOption('published');
      await expect(page.getByTestId(`service-link-${id}`)).toBeVisible();
      expect(
        queryDatabase(
          `select (provider_name like '%editat')::text from public.services where id = ${sqlLiteral(id)}`,
        ),
      ).toBe('true');
      await expect(page.getByTestId(`service-row-${id}`).locator('script, b')).toHaveCount(0);
    }

    const firstId = createdServiceIds[0];
    const firstCategory = categories[0];
    if (firstId === undefined || firstCategory === undefined)
      throw new Error('First service missing');
    await page.goto('/content/services');
    await page.getByTestId('service-category-filter').selectOption(firstCategory.id);
    await page.getByTestId('service-status-filter').selectOption('published');
    await page.getByTestId(`service-publish-${firstId}`).click();
    await expect
      .poll(() =>
        queryDatabase(`select status from public.services where id = ${sqlLiteral(firstId)}`),
      )
      .toBe('draft');
    await page.getByTestId('service-status-filter').selectOption('draft');
    await page.getByTestId(`service-publish-${firstId}`).click();
    await expect
      .poll(() =>
        queryDatabase(`select status from public.services where id = ${sqlLiteral(firstId)}`),
      )
      .toBe('published');
  });

  test('uploads multilingual images and persists explicit image ordering', async ({ page }) => {
    test.setTimeout(120_000);
    const id = createdServiceIds[0];
    if (id === undefined) throw new Error('The category lifecycle test did not create a service');
    await page.goto(`/content/services/${id}`);
    await approveExistingTitle(page);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    for (const index of [0, 1]) {
      await page.getByTestId('service-image-add').click();
      await page
        .getByTestId(`service-${index}-image`)
        .setInputFiles({ name: `${RUN_TAG}-${index}.png`, mimeType: 'image/png', buffer: png });
      await page.getByTestId(`service-image-alt-${index}-source`).fill(`Foto Àgora ${index}`);
    }
    await page.getByTestId('service-generate-translations').click();
    await expect(page.getByTestId('service-image-alt-0-draft-es')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('service-title-approve-all').click();
    await page.getByTestId('service-image-alt-0-approve-all').click();
    await page.getByTestId('service-image-alt-1-approve-all').click();
    await page.getByTestId('service-image-up-1').click();
    await page.getByTestId('service-mode').selectOption('now');
    await page.getByTestId('service-save').click();
    await expect(page).toHaveURL(/\/content\/services(?:\?.*)?$/, { timeout: 30_000 });

    expect(
      queryDatabase(
        `select string_agg(position || ':' || (alt_text->>'ca') || ':' || (select count(*) from jsonb_object_keys(i.alt_text)), ',' order by position) from public.service_images i where service_id = ${sqlLiteral(id)}`,
      ),
    ).toBe('0:Foto Àgora 1:5,1:Foto Àgora 0:5');
  });

  test('round trips category create, edit, reorder, delete, and blocks an incompatible seeded schema', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/content/services/categories');
    await expect(page.getByTestId('service-category-editor')).toBeVisible({ timeout: 20_000 });
    const name = `${RUN_TAG} Categoria Àgora`;
    const slug = `${RUN_TAG}-category`;
    await page.getByTestId('service-category-name-source').fill(name);
    await page.getByTestId('service-category-slug').fill(slug);
    await page.getByTestId('service-category-icon').fill('sparkles');
    await page.getByTestId('service-category-color').fill('accent');
    await page.getByTestId('service-category-generate').click();
    await expect(page.getByTestId('service-category-name-draft-es')).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId('service-category-name-approve-all').click();
    await page.getByTestId('service-category-save').click();
    await expect
      .poll(() =>
        queryDatabase(`select id from public.service_categories where slug = ${sqlLiteral(slug)}`),
      )
      .not.toBe('');
    const storedId = queryDatabase(
      `select id from public.service_categories where slug = ${sqlLiteral(slug)}`,
    );
    createdCategoryIds.push(storedId);

    await page.getByTestId(`service-category-edit-${storedId}`).click();
    await page.getByTestId('service-category-name-approve-all').click();
    await page.getByTestId('service-category-icon').fill('star');
    await page.getByTestId('service-category-schema').fill(
      JSON.stringify(
        {
          fields: [
            {
              key: 'qa_note',
              label: { ca: 'Nota', es: 'Nota', en: 'Note', ar: 'ملاحظة', fa: 'یادداشت' },
              type: 'text',
              required: false,
              filterable: false,
            },
          ],
        },
        null,
        2,
      ),
    );
    await page.getByTestId('service-category-save').click();
    expect(
      queryDatabase(
        `select icon || '|' || (select count(*) from jsonb_object_keys(c.name)) || '|' || jsonb_array_length(metadata_schema->'fields') from public.service_categories c where id = ${sqlLiteral(storedId)}`,
      ),
    ).toBe('star|5|1');
    await page.getByTestId(`service-category-up-${storedId}`).click();
    await expect
      .poll(() =>
        queryDatabase(
          `select (sort_order < (select max(sort_order) from public.service_categories))::text from public.service_categories where id = ${sqlLiteral(storedId)}`,
        ),
      )
      .toBe('true');

    const seeded = databaseCategories().find((category) => category.slug === 'housing');
    if (seeded === undefined) throw new Error('Housing category missing');
    await page.getByTestId(`service-category-edit-${seeded.id}`).click();
    await page.getByTestId('service-category-name-approve-all').click();
    const incompatible = { fields: seeded.metadata_schema.fields.slice(1) };
    await page.getByTestId('service-category-schema').fill(JSON.stringify(incompatible, null, 2));
    await page.getByTestId('service-category-save').click();
    await expect(page.getByTestId('service-category-schema-warning')).toBeVisible();
    expect(
      queryDatabase(
        `select (metadata_schema ? 'fields' and jsonb_array_length(metadata_schema->'fields') = ${seeded.metadata_schema.fields.length})::text from public.service_categories where id = ${sqlLiteral(seeded.id)}`,
      ),
    ).toBe('true');

    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .getByTestId(`service-category-row-${storedId}`)
      .getByRole('button', { name: /delete|elimina/i })
      .click();
    await expect
      .poll(() =>
        queryDatabase(
          `select count(*) from public.service_categories where id = ${sqlLiteral(storedId)}`,
        ),
      )
      .toBe('0');
  });
});

test('an entity contact cannot reach service administration', async ({ page }) => {
  await signIn(page, ENTITY_EMAIL);
  await page.goto('/content/services');
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
    .not.toContain('/content');
  await expect(page.getByTestId('service-editor')).toHaveCount(0);
});
