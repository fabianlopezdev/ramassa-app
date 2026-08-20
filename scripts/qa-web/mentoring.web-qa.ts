import { expect, test, type Page } from '@playwright/test';
import { PARTICIPANT_FIXTURES, SEED_ACCOUNT_PASSWORD, seedUserId } from '@ramassa/shared/testing';
import {
  accessTokenFor,
  queryDatabase,
  signIn,
  STAFF_EMAIL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from './session';

const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const requestingPlayer = PARTICIPANT_FIXTURES.find((fixture) => fixture.ordinal === 23)!;
const otherPlayer = PARTICIPANT_FIXTURES.find((fixture) => fixture.ordinal === 20)!;
const runTag = `rapp57-${Date.now().toString(36)}`;
const privateDetail = `${runTag} <img src=x onerror=alert(57)> أحتاج دعماً خاصاً`;
const staffNotes = `${runTag} private team follow-up`;
let requestId = '';

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function futureLocalDateTimeValue(daysFromNow: number): string {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function signInPlayer(page: Page, email: string): Promise<void> {
  await page.goto(`${playerOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const usePassword = page
    .getByRole('button', { name: /password|contrasenya|contraseña/i })
    .first();
  await expect(usePassword).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(SEED_ACCOUNT_PASSWORD);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByTestId('open-knowledge-base')).toBeVisible({ timeout: 30_000 });
}

test.afterAll(() => {
  if (requestId.length === 0) return;
  queryDatabase(`
    begin;
    create temporary table qa_mentoring_events on commit drop as
      select id from public.mentoring_notification_events
       where request_id = ${sqlLiteral(requestId)};
    create temporary table qa_mentoring_publications on commit drop as
      select id from public.push_publications
       where content_type = 'mentoring_update'
         and content_id in (select id from qa_mentoring_events);
    delete from public.push_deliveries
     where publication_id in (select id from qa_mentoring_publications);
    delete from public.push_publications
     where id in (select id from qa_mentoring_publications);
    delete from public.mentoring_requests where id = ${sqlLiteral(requestId)};
    commit;
  `);
});

test('private mentoring completes the player, staff, notification, calendar, and privacy flow', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);

  await signInPlayer(page, requestingPlayer.email);
  await page.goto(`${playerOrigin}/community`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('forum-open-mentoring').click();
  await expect(page.getByTestId('mentoring-screen')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('mentoring-topic-digital_skills').click();
  await page.getByTestId('mentoring-detail').fill(privateDetail);
  await page.getByTestId('mentoring-preferred-date').fill('2026-09-15');
  await page.getByTestId('mentoring-preferred-time').fill('10:30');
  await page.getByTestId('mentoring-submit').click();
  await expect(page.getByTestId('mentoring-request-confirmation')).toBeVisible({
    timeout: 30_000,
  });

  requestId = queryDatabase(
    `select id from public.mentoring_requests
      where player_id = ${sqlLiteral(seedUserId(requestingPlayer.ordinal))}
        and public.decrypt_field(topic_detail_encrypted) = ${sqlLiteral(privateDetail)}`,
  );
  expect(requestId).not.toBe('');
  expect(
    queryDatabase(
      `select topic || '|' || status || '|' || preferred_date || '|' || preferred_time
         from public.mentoring_requests where id = ${sqlLiteral(requestId)}`,
    ),
  ).toBe('digital_skills|requested|2026-09-15|10:30:00');

  await signIn(page, STAFF_EMAIL);
  await page.goto('/mentoring');
  const staffRow = page.getByTestId(`mentoring-row-${requestId}`);
  await expect(staffRow).toBeVisible({ timeout: 30_000 });
  await expect(staffRow.getByText(privateDetail, { exact: true })).toBeVisible();
  await expect(staffRow.locator('img[onerror]')).toHaveCount(0);
  await page.getByTestId(`mentoring-schedule-${requestId}`).fill(futureLocalDateTimeValue(7));
  await page
    .getByTestId(`mentoring-assignee-${requestId}`)
    .selectOption('5eed0000-0000-4000-8000-000000000002');
  await page.getByTestId(`mentoring-notes-${requestId}`).fill(staffNotes);
  await page.getByTestId(`mentoring-submit-schedule-${requestId}`).click();
  await expect(page.getByTestId(`mentoring-complete-${requestId}`)).toBeVisible({
    timeout: 30_000,
  });

  expect(
    queryDatabase(
      `select request.status || '|' || notification.kind || '|' || publication.content_type ||
              '|' || publication.recipient_id
         from public.mentoring_requests as request
         join public.mentoring_notification_events as notification
           on notification.request_id = request.id
         join public.push_publications as publication
           on publication.content_id = notification.id
        where request.id = ${sqlLiteral(requestId)}`,
    ),
  ).toBe(`scheduled|scheduled|mentoring_update|${seedUserId(requestingPlayer.ordinal)}`);
  expect(
    queryDatabase(
      `select count(*) from information_schema.columns
        where table_schema = 'public'
          and table_name = 'mentoring_notification_events'
          and column_name in ('topic', 'topic_detail', 'staff_notes', 'title', 'body')`,
    ),
  ).toBe('0');

  await page.goto(`${playerOrigin}/events`, { waitUntil: 'domcontentloaded' });
  const calendarEntry = page.getByTestId(`private-mentoring-calendar-${requestId}`);
  await expect(calendarEntry).toBeVisible({ timeout: 30_000 });
  await expect(calendarEntry).toContainText('Private appointment with the team');
  await expect(calendarEntry).not.toContainText(privateDetail);
  await expect(calendarEntry).not.toContainText(staffNotes);

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  try {
    await signInPlayer(otherPage, otherPlayer.email);
    await otherPage.goto(`${playerOrigin}/mentoring`, { waitUntil: 'domcontentloaded' });
    await expect(otherPage.getByTestId('mentoring-screen')).toBeVisible({ timeout: 30_000 });
    await expect(otherPage.getByTestId(`mentoring-request-${requestId}`)).toHaveCount(0);
  } finally {
    await otherContext.close();
  }

  const entityToken = await accessTokenFor('silvia.bosch@example.test', SEED_ACCOUNT_PASSWORD);
  const entityResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/mentoring_requests?select=id&id=eq.${requestId}`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization: `Bearer ${entityToken}`,
      },
    },
  );
  expect(entityResponse.ok).toBe(true);
  expect(await entityResponse.json()).toEqual([]);

  await page.goto('/mentoring');
  await page.getByTestId(`mentoring-complete-${requestId}`).click();
  await expect(page.getByTestId(`mentoring-complete-${requestId}`)).toHaveCount(0, {
    timeout: 30_000,
  });
  expect(
    queryDatabase(
      `select status || '|' || (completed_at is not null)::text
         from public.mentoring_requests where id = ${sqlLiteral(requestId)}`,
    ),
  ).toBe('completed|true');
});
