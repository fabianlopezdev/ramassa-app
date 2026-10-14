/**
 * The knowledge base in the app (RAPP-343), through the web build: a guide
 * written block by block, with a step moved above the paragraph, is published
 * only once the title and every translated body are approved, and is stored
 * with five aligned languages. A participant story sent for review is started
 * and returned for changes with a note. Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

async function openKnowledge(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page.getByTestId('content-kind-knowledge').click({ timeout: 30_000 });
  await expect(page.getByTestId('content-knowledge-total')).toBeVisible({ timeout: 30_000 });
}

async function editBlock(page: Page, index: number, fields: Record<string, string>) {
  await page.getByTestId(`knowledge-block-${index}-edit`).click();
  for (const [testId, value] of Object.entries(fields)) {
    await page.getByTestId(testId).fill(value);
  }
  await page.getByTestId('knowledge-block-done').click();
}

test('a guide is written block by block and published with five aligned languages', async ({
  page,
}) => {
  const tag = `app${Date.now().toString(36)}`;
  const title = `Guia ${tag}`;
  try {
    await openKnowledge(page);
    await page.getByTestId('content-knowledge-new').click();
    await page.getByTestId('knowledge-type-tutorial').click();
    await page.getByTestId('knowledge-title-source').fill(title);
    await editBlock(page, 0, { 'knowledge-block-text': `Introducció ${tag}` });

    // A new step opens on its own; then it moves above the paragraph.
    await page.getByTestId('knowledge-add-step').click();
    await page.getByTestId('knowledge-block-title').fill('Prepara els documents');
    await page.getByTestId('knowledge-block-text').fill('Porta el passaport.');
    await page.getByTestId('knowledge-block-done').click();
    await page.getByTestId('knowledge-block-1-up').click();
    await page.getByTestId('knowledge-mode-now').click();

    // Publishing before approving is refused at the button.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(
      page.getByText('Generate, review, and approve all five language versions before publishing.'),
    ).toBeVisible();

    await page.getByTestId('knowledge-generate').click();
    await expect(page.getByTestId('knowledge-title-draft-es')).toHaveValue(`[es] ${title}`, {
      timeout: 30_000,
    });
    await page.getByTestId('knowledge-title-approve-all').click();
    for (const language of ['es', 'en', 'ar', 'fa']) {
      await page.getByTestId(`knowledge-body-tab-${language}`).click();
      await expect(page.getByTestId(`knowledge-body-${language}-0-title`)).toHaveValue(
        `[${language}] Prepara els documents`,
      );
      await page.getByTestId(`knowledge-body-approve-${language}`).click();
    }
    await page.getByRole('button', { name: 'Publish', exact: true }).click();

    await expect
      .poll(
        () =>
          queryDatabase(`
            select is_published || '|' || content_type || '|' ||
                   (select count(*) from jsonb_object_keys(title)) || '|' ||
                   (body -> 'ca' -> 0 ->> 'type') || '|' ||
                   (body -> 'fa' -> 1 ->> 'text')
              from public.knowledge_articles where title ->> 'ca' = '${title}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe(`true|tutorial|5|step|[fa] Introducció ${tag}`);
  } finally {
    queryDatabase(`delete from public.knowledge_articles where title ->> 'ca' = '${title}';`);
  }
});

test('a participant story is started and returned for changes with a note', async ({ page }) => {
  const id = crypto.randomUUID();
  const title = `Història app${Date.now().toString(36)}`;
  queryDatabase(`
    insert into public.knowledge_articles
      (id, org_id, category_id, title, body, content_type, story_status, author_id, created_by)
    values (
      '${id}', '5eed0000-0000-4000-8000-000000000000', '5eed0000-0000-4000-8004-000000000004',
      '{"ca":"${title}"}',
      '{"ca":[{"type":"paragraph","text":"Una història personal per revisar."}]}'::jsonb,
      'participant_story', 'submitted',
      '5eed0000-0000-4000-8000-000000000012', '5eed0000-0000-4000-8000-000000000012'
    );
  `);
  try {
    await openKnowledge(page);
    await page.getByTestId('content-knowledge-kind-stories').click();
    await page.getByTestId(`content-knowledge-${id}`).click();
    await page.getByTestId('knowledge-start-review').click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select story_status from public.knowledge_articles where id = '${id}';`,
          ).trim(),
        { timeout: 30_000 },
      )
      .toBe('in_review');

    await page.getByTestId('knowledge-edit').click();
    await page.getByTestId('knowledge-reviewer-note').fill('Afegeix com et vas sentir.');
    await page.getByTestId('knowledge-request-changes').click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select story_status || '|' || reviewer_note from public.knowledge_articles where id = '${id}';`,
          ).trim(),
        { timeout: 30_000 },
      )
      .toBe('changes_requested|Afegeix com et vas sentir.');
  } finally {
    queryDatabase(`delete from public.knowledge_articles where id = '${id}';`);
  }
});
