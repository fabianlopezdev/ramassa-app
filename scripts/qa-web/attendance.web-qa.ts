/** Attendance overview through the real staff product, with owner-level expected values. */
import { expect, test } from '@playwright/test';
import { ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

const TODAY_EVENT_ID = '5eed0000-0000-4000-8003-000000000005';
const ADMIN_ORIGIN = `http://localhost:${process.env.RAMASSA_QA_ADMIN_PORT ?? '4193'}`;

test.describe('attendance overview', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([{ name: 'ramassa.language', value: 'ca', url: ADMIN_ORIGIN }]);
    await signIn(page, STAFF_EMAIL);
    await page.goto('/attendance');
    await expect(
      page.getByRole('heading', { name: /assistència|attendance|asistencia/i }),
    ).toBeVisible({
      timeout: 20_000,
    });
  });

  test('shows event completeness derived independently from roster, signups, and marks', async ({
    page,
  }) => {
    const occurrenceId = queryDatabase(
      `select id from public.event_occurrences where event_id = '${TODAY_EVENT_ID}' limit 1`,
    );
    const expected = queryDatabase(
      `select count(distinct p.id)
         from public.profiles p
        where p.role = 'player'
          and (p.is_active or exists (
            select 1 from public.event_signups s
             where s.event_id = '${TODAY_EVENT_ID}'
               and s.player_id = p.id
               and s.state <> 'cancelled'
          ))`,
    );
    const marked = queryDatabase(
      `select count(distinct a.player_id)
         from public.attendance a
         join public.profiles p on p.id = a.player_id
        where a.occurrence_id = '${occurrenceId}'
          and (p.is_active or exists (
            select 1 from public.event_signups s
             where s.event_id = '${TODAY_EVENT_ID}'
               and s.player_id = p.id
               and s.state <> 'cancelled'
          ))`,
    );

    await expect(page.getByText("Sessió d'entrenament d'avui")).toBeVisible();
    await expect(page.getByTestId(`attendance-progress-${occurrenceId}`)).toHaveText(
      `${marked} / ${expected}`,
    );
    await expect(page.getByTestId(`attendance-status-${occurrenceId}`)).toContainText(
      /en curs|in progress/i,
    );
  });

  test('keeps accent-normalized search and status in the URL across reload and browser back', async ({
    page,
  }) => {
    const search = page.getByTestId('attendance-search');
    const status = page.getByTestId('attendance-status-filter');
    await search.fill('sessio');
    await expect(page).toHaveURL(/[?&]q=sessio(?:&|$)/);
    await expect(page.getByText("Sessió d'entrenament d'avui")).toBeVisible();

    await status.selectOption('in_progress');
    await expect(page).toHaveURL(/[?&]status=in_progress(?:&|$)/);
    await page.reload();
    await expect(search).toHaveValue('sessio');
    await expect(status).toHaveValue('in_progress');

    await status.selectOption('all');
    await expect(status).toHaveValue('all');
    await page.goBack();
    await expect(status).toHaveValue('in_progress');
  });

  test('treats hostile search input as inert text and returns an honest empty state', async ({
    page,
  }) => {
    await page.getByTestId('attendance-search').fill('<img src=x onerror=alert(1)>');
    await expect(
      page.getByRole('heading', { name: /cap sessió|no attendance sessions/i }),
    ).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('opens a per-session report with exact participant marks and rate', async ({ page }) => {
    const occurrenceId = queryDatabase(
      `select id from public.event_occurrences where event_id = '${TODAY_EVENT_ID}' limit 1`,
    );
    const marked = Number(
      queryDatabase(
        `select count(*) from public.attendance where occurrence_id = '${occurrenceId}'`,
      ),
    );
    const rate = queryDatabase(
      `select round(
         100.0 * count(*) filter (where status = 'present') /
         nullif(count(*) filter (where status in ('present', 'absent')), 0),
         2
       ) from public.attendance where occurrence_id = '${occurrenceId}'`,
    );

    await page.getByRole('link', { name: "Sessió d'entrenament d'avui" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/attendance/${occurrenceId}`);
    await expect(page.locator('tbody tr')).toHaveCount(marked);
    await expect(page.getByTestId('attendance-rate')).toHaveText(`${rate}%`);
  });

  test('shows participant history and dashboard trend from the same reporting views', async ({
    page,
  }) => {
    await page.goto('/participants/5eed0000-0000-4000-8000-000000000011');
    await expect(
      page.getByRole('heading', { name: /historial d’assistència|attendance history/i }),
    ).toBeVisible();
    await expect(page.getByText(/present/i).first()).toBeVisible();

    await page.goto('/dashboard');
    await expect(
      page.getByRole('heading', { name: /rendiment d’assistència|attendance performance/i }),
    ).toBeVisible();
    await expect(page.getByTestId('attendance-rate')).toBeVisible();
    await expect(
      page.getByRole('img', { name: /taxa d’assistència per mes|attendance rate by month/i }),
    ).toBeVisible();
  });
});

test('an entity contact cannot reach attendance administration', async ({ page }) => {
  await signIn(page, ENTITY_EMAIL);
  await page.goto('/attendance');
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 20_000 })
    .not.toBe('/attendance');
  await expect(page.getByTestId('attendance-search')).toHaveCount(0);
});
