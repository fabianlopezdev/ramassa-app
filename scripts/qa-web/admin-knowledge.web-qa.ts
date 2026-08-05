/**
 * Knowledge CRUD and participant-story review through the real admin, local
 * database, translation Worker, and media Worker.
 */

import { expect, test, type Page } from '@playwright/test';
import { ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

const RUN_TAG = `rapp32${Date.now().toString(36)}`;
const createdIds: string[] = [];
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.afterAll(() => {
  if (createdIds.length === 0) return;
  queryDatabase(
    `delete from public.knowledge_articles where id in (${createdIds.map((id) => `'${id}'`).join(',')})`,
  );
});

function rememberArticle(title: string): string {
  const id = queryDatabase(
    `select id from public.knowledge_articles where title->>'ca' = '${title.replaceAll("'", "''")}' order by created_at desc limit 1`,
  );
  if (!id) throw new Error(`Knowledge resource was not stored: ${title}`);
  if (!createdIds.includes(id)) createdIds.push(id);
  return id;
}

async function openNewResource(page: Page, title: string, body: string) {
  await page.goto('/content/knowledge/new');
  await expect(page.getByTestId('knowledge-editor')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('knowledge-title-source').fill(title);
  await page.getByTestId('knowledge-block-0-text-ca').fill(body);
}

async function generateAndApprove(page: Page) {
  await page.getByTestId('knowledge-generate').click();
  await expect(page.getByTestId('knowledge-title-draft-es')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('knowledge-title-approve-all').click();
  for (const language of ['es', 'en', 'ar', 'fa']) {
    await page.getByTestId(`knowledge-body-approve-${language}`).click();
  }
}

function insertStory(title: string, authorId: string): string {
  const id = crypto.randomUUID();
  queryDatabase(
    `insert into public.knowledge_articles
       (id, org_id, category_id, title, body, content_type, story_status, author_id, created_by)
     values (
       '${id}',
       '5eed0000-0000-4000-8000-000000000000',
       '5eed0000-0000-4000-8004-000000000004',
       '{"ca":"${title}"}',
       '{"ca":[{"type":"paragraph","text":"Una història personal per revisar."}]}'::jsonb,
       'participant_story', 'submitted', '${authorId}', '${authorId}'
     )`,
  );
  createdIds.push(id);
  return id;
}

async function startStoryReview(page: Page, id: string) {
  await page.goto('/content/knowledge?kind=stories&storyStatus=all&page=1');
  await expect(page.getByTestId(`knowledge-start-review-${id}`)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId(`knowledge-start-review-${id}`).click();
  await expect
    .poll(() =>
      queryDatabase(`select story_status from public.knowledge_articles where id = '${id}'`),
    )
    .toBe('in_review');
  await page.getByTestId(`knowledge-link-${id}`).click();
  await expect(page.getByTestId('knowledge-editor')).toBeVisible();
}

test.describe('knowledge resources', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  test('publishes a five-language step guide with an image and allowlisted video', async ({
    page,
  }) => {
    const title = `${RUN_TAG} video guide`;
    await openNewResource(page, title, 'A short introduction for the guide.');
    await page.getByTestId('knowledge-content-type').selectOption('tutorial');
    await page.getByTestId('knowledge-video-url').fill('https://youtu.be/dQw4w9WgXcQ');
    await page.getByTestId('knowledge-add-step').click();
    await page.getByTestId('knowledge-block-1-title-ca').fill('Prepara els documents');
    await page.getByTestId('knowledge-block-1-text-ca').fill('Reuneix el passaport i el resguard.');
    await page.getByTestId('knowledge-block-1-alt-ca').fill('Documents preparats sobre una taula');
    await page.getByTestId('knowledge-block-1-image').setInputFiles({
      name: 'documents.png',
      mimeType: 'image/png',
      buffer: ONE_PIXEL_PNG,
    });
    await generateAndApprove(page);
    await page.getByTestId('knowledge-mode').selectOption('now');
    await page.getByTestId('knowledge-save').click();
    await expect(page).toHaveURL(/\/content\/knowledge(?:\?.*)?$/, { timeout: 30_000 });
    const id = rememberArticle(title);

    expect(
      queryDatabase(
        `select (video_url = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')::text || '|' ||
                (title ?& array['ca', 'es', 'en', 'ar', 'fa'])::text || '|' ||
                (body ?& array['ca', 'es', 'en', 'ar', 'fa'])::text || '|' ||
                (body->'ca'->1->>'imageUrl' like '%/knowledge-base/%')::text || '|' ||
                (body->'ca'->1->>'imageUrl' = body->'ar'->1->>'imageUrl')::text
           from public.knowledge_articles where id = '${id}'`,
      ),
    ).toBe('true|true|true|true|true');
  });

  test('keeps hostile text escaped and preserves a half-written draft across reload and back', async ({
    page,
  }) => {
    const hostile = `${RUN_TAG} <img src=x onerror="window.__owned=true"><script>alert(1)</script>`;
    await openNewResource(page, hostile, hostile);
    const preview = page.getByTestId('knowledge-preview');
    await expect(preview).toContainText(hostile);
    await expect(preview.locator('script')).toHaveCount(0);
    await expect(preview.locator('[onerror]')).toHaveCount(0);
    await page.getByTestId('knowledge-save').click();
    await expect(page).toHaveURL(/\/content\/knowledge(?:\?.*)?$/, { timeout: 20_000 });
    const id = rememberArticle(hostile);
    await page.getByTestId(`knowledge-link-${id}`).click();
    await page.reload();
    await expect(page.getByTestId('knowledge-title-source')).toHaveValue(hostile);
    await page.goBack();
    await expect(page.getByTestId(`knowledge-link-${id}`)).toContainText(hostile);
  });

  test('rejects a deceptive video host before any row is written', async ({ page }) => {
    const title = `${RUN_TAG} unsafe video`;
    await openNewResource(page, title, 'This row must never be stored.');
    await page
      .getByTestId('knowledge-video-url')
      .fill('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ');
    await page.getByTestId('knowledge-save').click();
    await expect(page.getByTestId('knowledge-form-error')).toBeVisible();
    expect(
      queryDatabase(
        `select count(*) from public.knowledge_articles where title->>'ca' = '${title}'`,
      ),
    ).toBe('0');
  });
});

test('drives publish, request-changes, and decline outcomes through the story queue', async ({
  page,
}) => {
  const publishId = insertStory(`${RUN_TAG} publish`, '5eed0000-0000-4000-8000-000000000011');
  const changesId = insertStory(`${RUN_TAG} changes`, '5eed0000-0000-4000-8000-000000000012');
  const rejectId = insertStory(`${RUN_TAG} reject`, '5eed0000-0000-4000-8000-000000000013');
  await signIn(page, STAFF_EMAIL);

  await startStoryReview(page, changesId);
  await page.getByTestId('knowledge-reviewer-note').fill('Explica una mica més el segon paràgraf.');
  await page.getByTestId('knowledge-request-changes').click();
  await expect
    .poll(() =>
      queryDatabase(`select story_status from public.knowledge_articles where id = '${changesId}'`),
    )
    .toBe('changes_requested');

  await startStoryReview(page, rejectId);
  await page.getByTestId('knowledge-reviewer-note').fill('No podem publicar dades identificables.');
  await page.getByTestId('knowledge-decline').click();
  await expect
    .poll(() =>
      queryDatabase(`select story_status from public.knowledge_articles where id = '${rejectId}'`),
    )
    .toBe('rejected');

  await startStoryReview(page, publishId);
  await generateAndApprove(page);
  await page.getByTestId('knowledge-mode').selectOption('now');
  await page.getByTestId('knowledge-save').click();
  await expect
    .poll(() =>
      queryDatabase(
        `select story_status || '|' || is_published::text from public.knowledge_articles where id = '${publishId}'`,
      ),
    )
    .toBe('published|true');
  expect(
    queryDatabase(
      `select author_first_name from public.knowledge_articles where id = '${publishId}'`,
    ),
  ).toBe(
    queryDatabase(
      "select first_name from public.profiles where id = '5eed0000-0000-4000-8000-000000000011'",
    ),
  );
});

test('blocks an entity contact from the staff knowledge route in the product', async ({ page }) => {
  await signIn(page, ENTITY_EMAIL);
  await page.goto('/content/knowledge');
  await expect(page).not.toHaveURL(/\/content\/knowledge/, { timeout: 20_000 });
  await expect(page.getByTestId('knowledge-table')).toHaveCount(0);
});
