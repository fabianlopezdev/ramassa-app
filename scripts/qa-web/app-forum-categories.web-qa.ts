/**
 * Forum categories in the app (RAPP-386), through the web build: a category
 * is created from its Catalan name with four approved translations and an
 * identifier made from that name, moved up, edited, refused deletion while it
 * has posts, then deleted. Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const tag = Date.now().toString(36);
const name = `Cursos ${tag}`;
const slug = `cursos-${tag}`;

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;

let seededOrder = '';

// Moving a category numbers every category again, so the seed's order goes back.
test.beforeAll(() => {
  seededOrder = queryDatabase(
    "select string_agg(id || '=' || sort_order, ',') from public.forum_categories;",
  ).trim();
});

test.afterAll(() => {
  for (const pair of seededOrder.split(',').filter(Boolean)) {
    const [id, sortOrder] = pair.split('=');
    queryDatabase(
      `update public.forum_categories set sort_order = ${Number(sortOrder)} where id = ${sql(id ?? '')};`,
    );
  }
  queryDatabase(`
    delete from public.forum_posts
     where category_id in (select id from public.forum_categories where slug = ${sql(slug)});
    delete from public.forum_categories where slug = ${sql(slug)};
  `);
});

async function openCategories(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  await page.getByTestId('team-more-forum').click({ timeout: 30_000 });
  await page.getByTestId('forum-moderation-categories').click({ timeout: 30_000 });
  await expect(page.getByTestId('forum-category-row-general')).toBeVisible({ timeout: 30_000 });
}

const row = () =>
  queryDatabase(`
    select icon || '|' || color || '|' || sort_order || '|' ||
           (select count(*) from jsonb_object_keys(name))
      from public.forum_categories where slug = ${sql(slug)};
  `).trim();

test('a category is created in five languages, moved, edited, and deleted once empty', async ({
  page,
}) => {
  page.on('dialog', (dialog) => void dialog.accept());
  await openCategories(page);
  const last = Number(queryDatabase('select max(sort_order) from public.forum_categories;').trim());

  await page.getByTestId('forum-category-new').click();
  await page.getByTestId('forum-category-name-source').fill(name);
  await expect(page.getByTestId('forum-category-slug')).toHaveValue(slug);

  // Not before every language is approved.
  await page.getByTestId('forum-category-save').click();
  await expect(page.getByText('Generate and approve every name translation.')).toBeVisible();
  await page.getByTestId('forum-category-generate').click();
  await page.getByTestId('forum-category-name-approve-all').click({ timeout: 60_000 });
  await page.getByTestId('forum-category-save').click();
  await expect(page.getByTestId(`forum-category-row-${slug}`)).toBeVisible({ timeout: 30_000 });
  expect(row()).toBe(`bubble|neutral|${last + 10}|5`);

  // Up past the last seeded category: the order is numbered again by tens.
  const before = queryDatabase(
    `select slug from public.forum_categories where sort_order = ${last};`,
  ).trim();
  await page.getByTestId(`forum-category-up-${slug}`).click();
  await expect
    .poll(
      () =>
        queryDatabase(`
          select string_agg(slug, ',' order by sort_order, id)
            from (select slug, sort_order, id from public.forum_categories
                   order by sort_order desc, id desc limit 2) as tail;
        `).trim(),
      { timeout: 30_000 },
    )
    .toBe(`${slug},${before}`);

  await page.getByTestId(`forum-category-edit-${slug}`).click();
  await page.getByTestId('forum-category-icon').fill('star');
  await page.getByTestId('forum-category-color').fill('info');
  // The saved translations come back as drafts, to approve again.
  await page.getByTestId('forum-category-name-approve-all').click();
  await page.getByTestId('forum-category-save').click();
  await expect.poll(row, { timeout: 30_000 }).toMatch(/^star\|info\|\d+\|5$/);

  // A category with a post cannot be deleted.
  queryDatabase(`
    insert into public.forum_posts (org_id, category_id, author_id, author_first_name, content)
    select category.org_id, category.id, profile.id, profile.first_name, 'Post de prova'
      from public.forum_categories as category
      cross join lateral (
        select id, first_name from public.profiles where role = 'player' order by id limit 1
      ) as profile
     where category.slug = ${sql(slug)};
  `);
  await page.getByTestId(`forum-category-delete-${slug}`).click();
  await expect(page.getByText('A category with posts cannot be deleted.')).toBeVisible({
    timeout: 30_000,
  });
  queryDatabase(`
    delete from public.forum_posts
     where category_id in (select id from public.forum_categories where slug = ${sql(slug)});
  `);
  await page.getByTestId(`forum-category-delete-${slug}`).click();
  await expect(page.getByTestId(`forum-category-row-${slug}`)).toHaveCount(0, {
    timeout: 30_000,
  });
  expect(row()).toBe('');
});
