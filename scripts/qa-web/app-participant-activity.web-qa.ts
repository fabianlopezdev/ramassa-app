/**
 * Her activity and material history on the participant card (RAPP-283),
 * through the web build: attendance and sign-ups on the timeline with their
 * status in words, a filter per source, and one handover's details with who
 * handed it over and her signature.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

const PARTICIPANT = '5eed0000-0000-4000-8000-000000000012';

const count = (table: string) =>
  Number(
    queryDatabase(
      `select count(*) from public.${table} where player_id = '${PARTICIPANT}';`,
    ).trim(),
  );

test('the timeline, a filter, and one handover with her signature', async ({ page }) => {
  const started = queryDatabase('select now();').trim();
  const deliveryId = queryDatabase(`
    insert into public.equipment_deliveries
      (profile_id, item, size, delivered_on, delivered_by, mode, signature, signature_state, statement_language)
    values (
      '${PARTICIPANT}', 'water_bottle', null, current_date,
      (select id from auth.users where email = '${STAFF_EMAIL}'), 'given',
      '[[[100,500],[300,300],[500,500]]]'::jsonb, 'signed', 'ar'
    )
    returning id;
  `)
    .trim()
    .split('\n')[0];
  try {
    await signInPlayer(page, STAFF_EMAIL);
    await completeSecondFactor(page, STAFF_EMAIL);
    await page.getByTestId('team-sidebar-participants').click({ timeout: 30_000 });
    await page.getByTestId(`participant-result-${PARTICIPANT}`).click({ timeout: 30_000 });
    await expect(page.getByTestId('participant-activity')).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId('participant-activity-attendance')).toHaveCount(
      count('attendance'),
    );
    await expect(page.getByTestId('participant-activity-event_signup')).toHaveCount(
      count('event_signups'),
    );
    const firstAttendance = page.getByTestId('participant-activity-attendance').first();
    await expect(firstAttendance).toContainText(/Present|Absent|Excused/);

    await page.getByTestId('activity-filter-event_signup').click();
    await expect(page.getByTestId('participant-activity-attendance')).toHaveCount(0);
    await expect(page.getByTestId('participant-activity-event_signup')).toHaveCount(
      count('event_signups'),
    );

    await page.getByTestId(`material-details-${deliveryId}`).click();
    const detail = page.getByTestId(`material-detail-${deliveryId}`);
    await expect(detail).toContainText('Handed over by Marta Puig', { timeout: 30_000 });
    await expect(detail).toContainText('Statement shown in العربية');
    await expect(detail.getByRole('img', { name: 'Her signature' })).toBeVisible();
  } finally {
    queryDatabase(`
      delete from public.stock_movements where equipment_delivery_id = '${deliveryId}';
      delete from public.equipment_deliveries where id = '${deliveryId}';
      delete from public.stock_alerts where opened_at >= '${started}';
    `);
  }
});
