/**
 * Staff event and category management through the real admin, translation
 * Worker, and local database. Database assertions are independent of the UI.
 */

import { expect, test, type Page } from '@playwright/test';
import { ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

const RUN_TAG = `rapp31${Date.now().toString(36)}`;
const createdEventIds: string[] = [];
const createdCategoryIds: string[] = [];

test.afterAll(() => {
  if (createdEventIds.length > 0) {
    queryDatabase(
      `delete from public.events where id in (${createdEventIds.map((id) => `'${id}'`).join(',')})`,
    );
  }
  if (createdCategoryIds.length > 0) {
    queryDatabase(
      `delete from public.event_categories where id in (${createdCategoryIds.map((id) => `'${id}'`).join(',')})`,
    );
  }
});

function rememberEvent(title: string): string {
  const id = queryDatabase(
    `select id from public.events where title->>'ca' = '${title}' order by created_at desc limit 1`,
  );
  if (id.length === 0) throw new Error('The event was not stored');
  if (!createdEventIds.includes(id)) createdEventIds.push(id);
  return id;
}

function rememberCategory(name: string): string {
  const id = queryDatabase(
    `select id from public.event_categories where name->>'ca' = '${name}' order by created_at desc limit 1`,
  );
  if (id.length === 0) throw new Error('The category was not stored');
  if (!createdCategoryIds.includes(id)) createdCategoryIds.push(id);
  return id;
}

async function openEditor(page: Page, suffix: string) {
  await page.goto('/content/events/new');
  await expect(page.getByTestId('event-editor')).toBeVisible({ timeout: 20_000 });
  const title = `${RUN_TAG} ${suffix}`;
  await page.getByTestId('event-title-source').fill(title);
  await page.getByTestId('event-location').fill('Camp Municipal de Vic');
  return title;
}

async function generateAndApproveEvent(page: Page) {
  await page.getByTestId('event-generate').click();
  await expect(page.getByTestId('event-title-draft-es')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('event-title-approve-all').click();
}

test.describe('event lifecycle and recurrence', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  test('creates a published one-off event with map, capacity, and interest signup', async ({
    page,
  }) => {
    const title = await openEditor(page, 'one off');
    await page.getByTestId('event-location-url').fill('https://maps.google.com/?q=Vic');
    await page.getByTestId('event-starts-at').fill('2026-10-18T11:00');
    await page.getByTestId('event-ends-at').fill('2026-10-18T13:00');
    await page.getByTestId('event-capacity').fill('20');
    await page.getByTestId('event-signup-mode').selectOption('interest');
    await page.getByTestId('event-mode').selectOption('now');
    await generateAndApproveEvent(page);
    await page.getByTestId('event-save').click();
    await expect(page).toHaveURL(/\/content\/events(?:\?.*)?$/, { timeout: 20_000 });
    const id = rememberEvent(title);

    expect(
      queryDatabase(
        `select e.signup_mode || '|' || e.max_participants || '|' ||
                (e.location_url like 'https://%')::text || '|' ||
                (select count(*) from public.event_occurrences o where o.event_id = e.id)
           from public.events e where e.id = '${id}'`,
      ),
    ).toBe('interest|20|true|1');

    await page.getByTestId(`event-link-${id}`).click();
    await expect(page.getByTestId('event-title-source')).toHaveValue(title);
    await expect(page.getByTestId('event-recurrence-one_off')).toBeChecked();
  });

  test('materializes weekly training at the same Madrid time across autumn DST', async ({
    page,
  }) => {
    const title = await openEditor(page, 'weekly DST');
    await page.getByTestId('event-recurrence-weekly').check();
    await page.getByTestId('event-starts-at').fill('2026-10-18T18:00');
    await page.getByTestId('event-ends-at').fill('2026-10-18T19:30');
    await page.getByTestId('event-recurrence-interval').fill('1');
    await page.getByTestId('event-recurrence-count').fill('3');
    await page.getByTestId('event-capacity').fill('24');
    await page.getByTestId('event-signup-mode').selectOption('confirm');
    await page.getByTestId('event-mode').selectOption('now');
    await generateAndApproveEvent(page);
    await page.getByTestId('event-save').click();
    await expect(page).toHaveURL(/\/content\/events(?:\?.*)?$/, { timeout: 20_000 });
    const id = rememberEvent(title);

    expect(
      queryDatabase(
        `select recurrence_rule || '|' || max_participants || '|' || signup_mode
           from public.events where id = '${id}'`,
      ),
    ).toBe('FREQ=WEEKLY;INTERVAL=1;COUNT=3|24|confirm');
    expect(
      queryDatabase(
        `select string_agg(to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), ',' order by starts_at)
           from public.event_occurrences where event_id = '${id}'`,
      ),
    ).toBe('2026-10-18 16:00,2026-10-25 17:00,2026-11-01 17:00');
    expect(
      queryDatabase(
        `select string_agg(to_char(starts_at at time zone 'Europe/Madrid', 'HH24:MI'), ',' order by starts_at)
           from public.event_occurrences where event_id = '${id}'`,
      ),
    ).toBe('18:00,18:00,18:00');
  });

  test('rejects an unsafe map URL before any row is written', async ({ page }) => {
    const title = await openEditor(page, 'unsafe map');
    await page.getByTestId('event-location-url').fill('javascript:alert(document.domain)');
    await page.getByTestId('event-starts-at').fill('2026-10-18T11:00');
    await page.getByTestId('event-save').click();

    await expect(page.getByTestId('event-form-error')).toBeVisible();
    expect(
      queryDatabase(`select count(*) from public.events where title->>'ca' = '${title}'`),
    ).toBe('0');
  });

  test('creates, reorders, and reflects a fixed category icon and color in the editor', async ({
    page,
  }) => {
    await page.goto('/content/events/categories');
    await expect(page.getByTestId('event-category-editor')).toBeVisible({ timeout: 20_000 });
    const name = `${RUN_TAG} category`;
    await page.getByTestId('event-category-name-source').fill(name);
    await page.getByTestId('event-category-icon').selectOption('theater');
    await page.getByTestId('event-category-color').selectOption('chart-2');
    await page.getByTestId('event-category-generate').click();
    await expect(page.getByTestId('event-category-name-draft-es')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('event-category-name-approve-all').click();
    await page.getByTestId('event-category-save').click();

    const id = await expect
      .poll(() => {
        const stored = queryDatabase(
          `select id from public.event_categories where name->>'ca' = '${name}'`,
        );
        return stored;
      })
      .not.toBe('');
    void id;
    const categoryId = rememberCategory(name);
    const firstRow = page.getByTestId('event-category-list').locator('li').first();
    await page.getByTestId(`event-category-row-${categoryId}`).dragTo(firstRow);
    await expect
      .poll(() =>
        queryDatabase(`select sort_order from public.event_categories where id = '${categoryId}'`),
      )
      .toBe('10');
    expect(
      queryDatabase(
        `select icon || '|' || color || '|' || (select count(*) from jsonb_object_keys(name))
           from public.event_categories where id = '${categoryId}'`,
      ),
    ).toBe('theater|chart-2|5');

    await page.goto('/content/events/new');
    await page.getByTestId('event-category').selectOption(categoryId);
    const selected = page.getByTestId('event-selected-category');
    await expect(selected).toContainText(name);
    await expect(selected.locator(`[aria-label="${name}"]`)).toBeVisible();
    await expect(selected.locator('[data-color="chart-2"]')).toBeVisible();
  });

  test('category and lifecycle filters match the independent database count', async ({ page }) => {
    await page.goto('/content/events');
    const categoryId = queryDatabase(
      `select id from public.event_categories order by sort_order, id limit 1`,
    );
    await page.getByTestId('event-category-filter').selectOption(categoryId);
    await page.getByTestId('event-status-filter').selectOption('published');
    await expect(page).toHaveURL(/[?&]status=published(?:&|$)/);
    const expected = Number(
      queryDatabase(
        `select count(*) from public.events
          where category_id = '${categoryId}' and status = 'published'
            and published_at <= now() and (expires_at is null or expires_at > now())`,
      ),
    );
    await expect(page.locator('tbody tr')).toHaveCount(expected);
  });
});

test('an entity contact cannot reach event administration', async ({ page }) => {
  await signIn(page, ENTITY_EMAIL);
  await page.goto('/content/events');
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
    .not.toContain('/content');
  await expect(page.getByTestId('event-editor')).toHaveCount(0);
});
