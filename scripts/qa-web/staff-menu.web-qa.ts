/**
 * The staff menu grouped by audience (RAPP-654), signed in as the seeded
 * admin: Dashboard and Participants on top, then the players' app, the
 * entities and the organization, each under its label. Every page sits in
 * one place: the team, the entities, the referral form and the Fitxa left
 * Settings for their own menu items, and their old Settings addresses forward
 * to them. Only the page she is on is marked, also under the roster
 * (Referrals, Seasons). In the icon rail the labels fold away and every icon
 * names its page in a tooltip.
 */

import { expect, test, type Locator } from '@playwright/test';
import { signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';

test.setTimeout(120_000);

function groupLinks(menu: Locator, group: string): Locator {
  return menu.getByTestId(`staff-nav-group-${group}`).getByRole('link');
}

test.describe.serial('the staff menu', () => {
  test('groups by audience, in the agreed order', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    const menu = page.getByRole('navigation', { name: 'Staff navigation' });
    await expect(menu).toBeVisible({ timeout: 30_000 });

    await expect(menu.locator('[data-sidebar="group-label"]')).toHaveText([
      "Players' app",
      'Entities',
      'Organization',
    ]);
    await expect(groupLinks(menu, 'top')).toHaveText(['Dashboard', 'Participants']);
    await expect(groupLinks(menu, 'app')).toHaveText([
      'Onboarding',
      'Content',
      'Attendance',
      /^Messages/,
      'Forum moderation',
      'Gallery',
      'Mentoring',
      'Feedback',
      'Surveys',
      'Notifications',
    ]);
    await expect(groupLinks(menu, 'entities')).toHaveText([
      'Referrals',
      'Referral form',
      'Collaborating entities',
    ]);
    await expect(groupLinks(menu, 'organisation')).toHaveText([
      'Player profile',
      'Team',
      'Seasons',
      'Data and audit',
      'Settings',
    ]);
    // Each group names its list for screen readers.
    await expect(menu.getByRole('list', { name: 'Entities' })).toBeVisible();
  });

  test('marks only the page she is on, also under the roster', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    const menu = page.getByRole('navigation', { name: 'Staff navigation' });
    for (const [path, name] of [
      ['/participants/referrals', 'Referrals'],
      ['/participants/season', 'Seasons'],
      ['/participants', 'Participants'],
      ['/entities/referral-form', 'Referral form'],
      ['/entities', 'Collaborating entities'],
    ] as const) {
      await page.goto(path);
      await expect(menu.locator('a[aria-current="page"]')).toHaveText([name], {
        timeout: 20_000,
      });
    }
  });

  test('Settings keeps its own tabs, and the moved ones forward to their pages', async ({
    page,
  }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/settings');
    await expect(page.getByTestId('organization-settings-form')).toBeVisible({ timeout: 30_000 });
    for (const name of ['Team', 'Entities', 'Player profile', 'Referral form']) {
      await expect(page.getByRole('tab', { name, exact: true })).toHaveCount(0);
    }
    for (const [from, to, ready] of [
      ['/settings?tab=staff', /\/team$/, 'team-access'],
      ['/settings?tab=entities', /\/entities$/, 'entity-create-form'],
      ['/settings?tab=referral-form', /\/entities\/referral-form$/, 'referral-form-page'],
      ['/settings?tab=profile-layout', /\/profile-layout$/, 'profile-layout'],
    ] as const) {
      await page.goto(from);
      await expect(page).toHaveURL(to, { timeout: 20_000 });
      await expect(page.getByTestId(ready)).toBeVisible({ timeout: 20_000 });
    }
  });

  test('the icon rail hides the labels and names every icon in a tooltip', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, ADMIN_EMAIL);
    const menu = page.getByRole('navigation', { name: 'Staff navigation' });
    await expect(menu).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Toggle sidebar' }).first().click();
    await expect(page.locator('[data-collapsible="icon"]')).toHaveCount(1);
    for (const label of await menu.locator('[data-sidebar="group-label"]').all()) {
      await expect(label).toHaveCSS('opacity', '0');
    }
    await menu.locator('a[href="/profile-layout"]').hover();
    await expect(page.getByRole('tooltip')).toHaveText('Player profile');
  });
});
