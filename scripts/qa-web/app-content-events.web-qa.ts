/**
 * Events and event categories in the app (RAPP-342), through the web build: a
 * weekly event is published only once its translations are approved, the
 * database makes its sessions in Madrid time, an edit takes it back to draft,
 * and a category is created with five languages, moved and deleted. Expected
 * values come from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

async function openEvents(page: Page): Promise<void> {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-content').click({ timeout: 30_000 });
  await page.getByTestId('content-kind-events').click({ timeout: 30_000 });
  await expect(page.getByTestId('content-events-total')).toBeVisible({ timeout: 30_000 });
}

test('a weekly event is published with approved translations, then taken back to draft', async ({
  page,
}) => {
  const tag = `app${Date.now().toString(36)}`;
  const title = `Taller ${tag}`;
  const categoryId = queryDatabase(
    'select id from public.event_categories order by sort_order, id limit 1;',
  ).trim();
  try {
    await openEvents(page);
    await page.getByTestId('content-event-new').click();
    await page.getByTestId(`event-category-${categoryId}`).click();
    await page.getByTestId('event-title-source').fill(title);
    await page.getByTestId('event-location').fill('Casal del barri');
    await page.getByTestId('event-recurrence-weekly').click();
    // 18:30 in Madrid in winter is 17:30 UTC.
    await page.getByTestId('event-starts-at').fill('2027-03-01T18:30');
    await page.getByTestId('event-ends-at').fill('2027-03-01T20:00');
    await page.getByTestId('event-interval-2').click();
    await page.getByTestId('event-count').fill('4');
    await page.getByTestId('event-capacity').fill('15');
    await page.getByTestId('event-signup-confirm').click();
    await page.getByTestId('event-mode-now').click();

    // Publishing before approving is refused at the button.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(
      page.getByText('Generate and approve every required translation before publishing.'),
    ).toBeVisible();

    await page.getByTestId('event-generate').click();
    await expect(page.getByTestId('event-title-draft-es')).toHaveValue(`[es] ${title}`, {
      timeout: 30_000,
    });
    await page.getByTestId('event-title-approve-all').click();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();

    await expect
      .poll(
        () =>
          queryDatabase(`
            select e.status || '|' || e.recurrence_rule || '|' || e.max_participants || '|' ||
                   e.signup_mode || '|' || to_char(e.starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') ||
                   '|' || (select count(*) from jsonb_object_keys(e.title)) || '|' ||
                   (select count(*) from public.event_occurrences o where o.event_id = e.id)
              from public.events e where e.title ->> 'ca' = '${title}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe('published|FREQ=WEEKLY;INTERVAL=2;COUNT=4|15|confirm|2027-03-01 17:30|5|4');

    const id = queryDatabase(
      `select id from public.events where title ->> 'ca' = '${title}';`,
    ).trim();
    await page.getByTestId(`content-event-${id}`).click();
    await expect(page.getByTestId('event-detail-sessions')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('event-edit').click();
    await page.getByTestId('event-mode-draft').click();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect
      .poll(
        () =>
          queryDatabase(
            `select status || '|' || coalesce(published_at::text, 'none') from public.events where id = '${id}';`,
          ).trim(),
        { timeout: 30_000 },
      )
      .toBe('draft|none');
  } finally {
    queryDatabase(`delete from public.events where title ->> 'ca' = '${title}';`);
  }
});

test('a category is created in five languages, moved up and deleted', async ({ page }) => {
  const tag = `app${Date.now().toString(36)}`;
  const name = `Categoria ${tag}`;
  try {
    await openEvents(page);
    await page.getByTestId('content-event-categories').click();
    await page.getByTestId('event-category-new').click();
    await page.getByTestId('category-name-source').fill(name);

    // Saving before the names are approved is refused.
    await page.getByTestId('category-save').click();
    await expect(page.getByText('Generate and approve every name translation.')).toBeVisible();

    await page.getByTestId('category-generate').click();
    await expect(page.getByTestId('category-name-draft-es')).toHaveValue(`[es] ${name}`, {
      timeout: 30_000,
    });
    await page.getByTestId('category-name-approve-all').click();
    await page.getByTestId('category-icon-theater').click();
    await page.getByTestId('category-color-chart-2').click();
    await page.getByTestId('category-save').click();

    await expect
      .poll(
        () =>
          queryDatabase(`
            select icon || '|' || color || '|' || (select count(*) from jsonb_object_keys(name))
              from public.event_categories where name ->> 'ca' = '${name}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe('theater|chart-2|5');

    const id = queryDatabase(
      `select id from public.event_categories where name ->> 'ca' = '${name}';`,
    ).trim();
    const rank = () =>
      queryDatabase(`
        select position from (
          select id, row_number() over (order by sort_order, id) as position
            from public.event_categories
        ) ranked where id = '${id}';
      `).trim();
    const before = Number(rank());
    await page.getByTestId(`event-category-up-${id}`).click();
    await expect.poll(() => Number(rank()), { timeout: 30_000 }).toBe(before - 1);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId(`event-category-delete-${id}`).click();
    await expect
      .poll(
        () =>
          queryDatabase(`select count(*) from public.event_categories where id = '${id}';`).trim(),
        { timeout: 30_000 },
      )
      .toBe('0');
  } finally {
    queryDatabase(`delete from public.event_categories where name ->> 'ca' = '${name}';`);
  }
});
