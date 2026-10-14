/**
 * Mentoring requests in the app (RAPP-382), through the web build: Today
 * shows the requests waiting and opens them; a request is scheduled with a
 * time in Madrid, a team member and private notes, which tells her, and then
 * marked completed. Expected values come from the database.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const ORG = '5eed0000-0000-4000-8000-000000000000';
const PLAYER = '5eed0000-0000-4000-8000-000000000012';
const STAFF_ID = '5eed0000-0000-4000-8000-000000000002';

function removeRequest(id: string): void {
  queryDatabase(`
    delete from public.push_publications
     where content_id in (select id from public.mentoring_notification_events where request_id = '${id}');
    delete from public.mentoring_notification_events where request_id = '${id}';
    delete from public.mentoring_requests where id = '${id}';
  `);
}

test('a request waits on Today, is scheduled in Madrid time, then completed', async ({ page }) => {
  const id = queryDatabase(`
    insert into public.mentoring_requests (org_id, player_id, topic, preferred_date)
    values ('${ORG}', '${PLAYER}', 'digital_skills', '2027-03-01')
    returning id;
  `)
    .trim()
    .split('\n')[0]!;
  try {
    await signInPlayer(page, STAFF_EMAIL);
    await completeSecondFactor(page, STAFF_EMAIL);
    const card = page.getByTestId('today-mentoring');
    await expect(card).toContainText(/: 1/, { timeout: 30_000 });
    await card.click();
    const request = page.getByTestId(`mentoring-request-${id}`);
    await expect(request).toBeVisible({ timeout: 30_000 });

    await page.getByTestId(`mentoring-schedule-${id}`).fill('2027-03-02T10:30');
    await page.getByTestId(`mentoring-assignee-${id}-${STAFF_ID}`).click();
    await page.getByTestId(`mentoring-notes-${id}`).fill('Porta el CV.');
    await page.getByTestId(`mentoring-submit-schedule-${id}`).click();
    await expect
      .poll(
        () =>
          queryDatabase(`
            select r.status || '|' || to_char(r.scheduled_at at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI') || '|' ||
                   r.assigned_staff_id || '|' ||
                   (select count(*) from public.mentoring_notification_events n where n.request_id = r.id)
              from public.mentoring_requests r where r.id = '${id}';
          `).trim(),
        { timeout: 30_000 },
      )
      .toBe(`scheduled|2027-03-02 10:30|${STAFF_ID}|1`);

    await page.getByTestId(`mentoring-complete-${id}`).click({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          queryDatabase(`select status from public.mentoring_requests where id = '${id}';`).trim(),
        { timeout: 30_000 },
      )
      .toBe('completed');
    await expect(page.getByTestId(`mentoring-complete-${id}`)).toHaveCount(0);
  } finally {
    removeRequest(id);
  }
});
