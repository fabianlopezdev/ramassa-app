/**
 * The impact dashboard in the app (RAPP-400), through the web build: the
 * report is asked for this year in Madrid days by default, each figure card
 * shows what the database returned, a card opens its chart per month with
 * the same numbers as a table, and the period and category controls ask the
 * database again with the right filters.
 */
import { expect, test, type Page, type Response } from '@playwright/test';
import { completeSecondFactor, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

interface ReportRequest {
  readonly p_start_date: string;
  readonly p_end_date: string;
  readonly p_category_id: string | null;
}

interface WireReport {
  readonly summary: {
    readonly suppressed: boolean;
    readonly participant_count?: number;
    readonly new_participant_count?: number;
    readonly attendance_rate?: number;
  };
  readonly participant_trend: readonly {
    readonly month_start: string;
    readonly new_participant_count: number;
  }[];
  readonly available_filters: { readonly categories: readonly { readonly id: string }[] };
}

const isReport = (response: Response) => response.url().includes('/rpc/get_impact_report');

async function reportFrom(response: Response) {
  return {
    request: response.request().postDataJSON() as ReportRequest,
    report: (await response.json()) as WireReport,
  };
}

function madridToday(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function openImpact(page: Page) {
  await signInPlayer(page, STAFF_EMAIL);
  await completeSecondFactor(page, STAFF_EMAIL);
  await page.getByTestId('team-sidebar-more').click({ timeout: 30_000 });
  const first = page.waitForResponse(isReport, { timeout: 30_000 });
  await page.getByTestId('team-more-impact').click({ timeout: 30_000 });
  return reportFrom(await first);
}

test('the cards show the report, a card opens its chart, and the filters ask again', async ({
  page,
}) => {
  const { request, report } = await openImpact(page);
  const today = madridToday();
  expect(request).toMatchObject({
    p_start_date: `${today.slice(0, 4)}-01-01`,
    p_end_date: today,
    p_category_id: null,
  });
  expect(report.summary.suppressed).toBe(false);
  await expect(page.getByTestId('impact-card-participants')).toContainText(
    String(report.summary.participant_count),
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('impact-card-rate')).toContainText(
    `${report.summary.attendance_rate?.toFixed(2)}%`,
  );

  await page.getByTestId('impact-card-new').click();
  await expect(page.getByTestId('impact-chart-sheet')).toBeVisible();
  expect(report.participant_trend.length).toBeGreaterThan(0);
  for (const point of report.participant_trend) {
    await expect(page.getByTestId(`impact-chart-row-${point.month_start}`)).toContainText(
      String(point.new_participant_count),
    );
  }
  await page.getByTestId('impact-chart-close').click();
  await expect(page.getByTestId('impact-chart-sheet')).toHaveCount(0);

  const week = page.waitForResponse(isReport, { timeout: 30_000 });
  await page.getByTestId('impact-period-week').click();
  const weekly = await reportFrom(await week);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  expect(weekly.request).toMatchObject({
    p_start_date: start.toISOString().slice(0, 10),
    p_end_date: today,
  });

  const category = report.available_filters.categories[0];
  expect(category).toBeDefined();
  const filtered = page.waitForResponse(isReport, { timeout: 30_000 });
  await page.getByTestId(`impact-category-${category?.id}`).click();
  expect((await reportFrom(await filtered)).request.p_category_id).toBe(category?.id);
});
