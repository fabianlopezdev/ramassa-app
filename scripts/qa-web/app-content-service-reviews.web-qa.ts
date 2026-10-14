/**
 * The service review queue in the app (RAPP-345), through the web build: a
 * pending submission from a partner entity is commented on and rejected with a
 * comment, so the entity can correct it and send it again; another is
 * approved and published from the service form with five languages and a
 * comment the entity sees; a change to a live service is marked as reviewed.
 * Expected values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const HOUSING_ID = '5eed0000-0000-4000-8009-000000000001';
const ENTITY_USER_ID = '5eed0000-0000-4000-8000-000000000004';
const LIVE_EDIT_NOTIFICATION = '5eed0000-0000-4000-800e-000000000001';

function insertPendingService(title: string): string {
  const id = crypto.randomUUID();
  queryDatabase(`
    insert into public.services (
      id, org_id, category_id, title, description, provider_name, metadata,
      cost_type, availability, status, submitted_by, created_by
    ) values (
      '${id}', '${ORG_ID}', '${HOUSING_ID}', '{"ca":"${title}"}', '{"ca":"Pis compartit a Vic."}',
      'Creu Roja Osona',
      '{"duration":"temporary","for_whom":"women_only","housing_type":"room","deposit_required":false}',
      'free', 'available', 'pending', '${ENTITY_USER_ID}', '${ENTITY_USER_ID}'
    );
  `);
  return id;
}

async function openQueue(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page.getByTestId('content-kind-reviews').click({ timeout: 30_000 });
  await expect(page.getByTestId('content-reviews-total')).toBeVisible({ timeout: 30_000 });
}

test('a submission gets a comment and is rejected so the entity can correct it', async ({
  page,
}) => {
  const title = `Proposta ${Date.now().toString(36)}`;
  const id = insertPendingService(title);
  try {
    await openQueue(page);
    await page.getByTestId('content-review-query').fill(title);
    await page.getByTestId(`content-review-pending-${id}`).click({ timeout: 30_000 });
    await page.getByTestId('service-review-comment-body').fill('Falta el telèfon de contacte.');
    await page.getByTestId('service-review-comment-send').click();
    await page
      .getByTestId('service-review-rejection-comment')
      .fill('Afegeix el telèfon i torna-la a enviar.');
    await page.getByTestId('service-review-reject').click();
    await expect
      .poll(
        () =>
          queryDatabase(`
            select s.status || '|' || (
              select string_agg(c.body || ':' || c.is_internal, ' / ' order by c.created_at)
                from public.service_submission_comments c where c.service_id = s.id
            ) from public.services s where s.id = '${id}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe(
        'rejected|Falta el telèfon de contacte.:false / Afegeix el telèfon i torna-la a enviar.:false',
      );
  } finally {
    queryDatabase(`delete from public.services where id = '${id}';`);
  }
});

test('a submission is approved and published with five languages and a comment', async ({
  page,
}) => {
  const title = `Proposta ${Date.now().toString(36)}`;
  const id = insertPendingService(title);
  try {
    await openQueue(page);
    await page.getByTestId('content-review-query').fill(title);
    await page.getByTestId(`content-review-pending-${id}`).click({ timeout: 30_000 });
    await page.getByTestId('service-review-approve').click();
    await page.getByTestId('service-generate').click({ timeout: 30_000 });
    await expect(page.getByTestId('service-title-draft-es')).toHaveValue(`[es] ${title}`, {
      timeout: 30_000,
    });
    await page.getByTestId('service-title-approve-all').click();
    await page.getByTestId('service-description-approve-all').click();
    await page.getByTestId('service-review-approval-comment').fill('Publicada. Gràcies!');
    await page.getByRole('button', { name: 'Approve and publish', exact: true }).click();
    await expect
      .poll(
        () =>
          queryDatabase(`
            select s.status || '|' || (select count(*) from jsonb_object_keys(s.title)) || '|' ||
                   (select c.body from public.service_submission_comments c
                     where c.service_id = s.id and not c.is_internal)
              from public.services s where s.id = '${id}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe('published|5|Publicada. Gràcies!');
    // The approval goes back to the queue.
    await expect(page.getByTestId('content-reviews-total')).toBeVisible({ timeout: 30_000 });
  } finally {
    queryDatabase(`delete from public.services where id = '${id}';`);
  }
});

test('a change to a live service is marked as reviewed', async ({ page }) => {
  try {
    await openQueue(page);
    await page.getByTestId('content-review-kind-published_edit').click();
    await page
      .getByTestId(`content-review-published_edit-${LIVE_EDIT_NOTIFICATION}`)
      .click({ timeout: 30_000 });
    await expect(page.getByTestId('service-review-diff')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('service-review-mark-reviewed').click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select read_at is not null from public.service_submission_notifications where id = '${LIVE_EDIT_NOTIFICATION}';`,
          ).trim(),
        { timeout: 30_000 },
      )
      .toBe('t');
  } finally {
    queryDatabase(
      `update public.service_submission_notifications set read_at = null, read_by = null where id = '${LIVE_EDIT_NOTIFICATION}';`,
    );
  }
});
