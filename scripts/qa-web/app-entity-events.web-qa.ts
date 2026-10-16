/**
 * The entity's Events tab in the app (RAPP-412), through the web build: the
 * published upcoming events in date order, each with its title in the
 * reader's language and the recurring mark, and none that is not published
 * or already past. Expected values come from the database.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, ENTITY_EMAIL, queryDatabase, signInPlayer } from './session';

test.setTimeout(240_000);

const UPCOMING = `
  event.status = 'published'
  and event.published_at <= now()
  and (event.expires_at is null or event.expires_at > now())
  and event.starts_at >= now()`;

test('the published upcoming events, in order, read only', async ({ page }) => {
  const expected = queryDatabase(`
    select event.id || '|' || coalesce(event.title->>'en', event.title->>'ca') || '|' ||
           event.is_recurring
      from public.events as event
     where ${UPCOMING}
     order by event.starts_at, event.id;
  `)
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [id = '', title = '', recurring = ''] = line.split('|');
      return { id, title, isRecurring: recurring === 'true' };
    });
  expect(expected.length).toBeGreaterThan(0);
  const hidden = queryDatabase(`
    select event.id from public.events as event where not (${UPCOMING}) limit 1;
  `).trim();

  await signInPlayer(page, ENTITY_EMAIL);
  await completeSecondFactor(page, ENTITY_EMAIL);
  await page.getByTestId('entity-sidebar-events').click({ timeout: 30_000 });
  await expect(page.getByTestId('entity-events')).toBeVisible({ timeout: 30_000 });

  const cards = page.locator('[data-testid^="entity-event-"]:not([data-testid*="recurring"])');
  await expect(cards).toHaveCount(expected.length, { timeout: 30_000 });
  for (const [index, event] of expected.entries()) {
    await expect(cards.nth(index)).toHaveAttribute('data-testid', `entity-event-${event.id}`);
    await expect(cards.nth(index)).toContainText(event.title);
    await expect(page.getByTestId(`entity-event-recurring-${event.id}`)).toHaveCount(
      event.isRecurring ? 1 : 0,
    );
  }
  if (hidden.length > 0) await expect(page.getByTestId(`entity-event-${hidden}`)).toHaveCount(0);
});
