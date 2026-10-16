/**
 * The entity's Home in the app (RAPP-411), through the web build: an entity
 * contact sees the impact and the tracking of exactly the women her entity
 * referred, and nobody from another entity; an entity with fewer than three
 * referred women sees the privacy note and no figures. Expected values come
 * from the database.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  completeSecondFactor,
  ENTITY_EMAIL,
  OTHER_ENTITY_EMAIL,
  queryDatabase,
  signInPlayer,
} from './session';

test.setTimeout(240_000);

const OWN_ENTITY = '5eed0000-0000-4000-8030-000000000001';
const OTHER_ENTITY = '5eed0000-0000-4000-8030-000000000002';

async function openHome(page: Page, email: string): Promise<void> {
  await signInPlayer(page, email);
  await completeSecondFactor(page, email);
  await expect(page.getByTestId('entity-home')).toBeVisible({ timeout: 30_000 });
}

test('her own impact and tracking, and none of another entity', async ({ page }) => {
  await openHome(page, ENTITY_EMAIL);
  const referrals = queryDatabase(`
    select string_agg(id::text, ',') from public.entity_referrals
     where collaborating_entity_id = '${OWN_ENTITY}' and referred_profile_id is not null;
  `)
    .trim()
    .split(',');
  await expect(page.getByTestId('entity-impact-referred')).toContainText(String(referrals.length), {
    timeout: 30_000,
  });
  for (const id of referrals) {
    await expect(page.getByTestId(`entity-tracking-${id}`)).toBeVisible();
  }
  const otherName = queryDatabase(`
    select referred_first_name || ' ' || referred_last_name from public.entity_referrals
     where collaborating_entity_id = '${OTHER_ENTITY}' and referred_profile_id is not null limit 1;
  `).trim();
  await expect(page.getByText(otherName, { exact: true })).toHaveCount(0);
});

test('a small entity sees the privacy note and no figures', async ({ page }) => {
  await openHome(page, OTHER_ENTITY_EMAIL);
  await expect(page.getByTestId('entity-impact-suppressed')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('entity-impact-referred')).toHaveCount(0);
  await expect(page.getByTestId('entity-monthly')).toHaveCount(0);
});
