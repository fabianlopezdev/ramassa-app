/**
 * Participant invites in the app (RAPP-284), through the web build: a new
 * invite with a referring entity, a renewal of an expired one, and a
 * cancellation that also removes the empty account, so the address cannot
 * sign in.
 */
import { expect, test } from '@playwright/test';
import { completeSecondFactor, queryDatabase, signInPlayer, STAFF_EMAIL } from './session';

test.setTimeout(240_000);

test('invite, renew an expired invite, and cancel it', async ({ page }) => {
  const email = `invite.qa.${Date.now()}@example.test`;
  const inviteId = () =>
    queryDatabase(`select id from public.invites where email = '${email}';`).trim();
  try {
    await signInPlayer(page, STAFF_EMAIL);
    await completeSecondFactor(page, STAFF_EMAIL);
    await page.getByTestId('team-sidebar-participants').click({ timeout: 30_000 });
    await page.getByTestId('participants-invites').click({ timeout: 30_000 });

    await page.getByTestId('invites-new').click();
    await page.getByTestId('invite-create').click();
    await expect(page.getByText('Write a valid email address.')).toBeVisible();
    await page.getByTestId('invite-email').fill(email);
    await page.getByTestId('invite-entity-Creu Roja Osona').click();
    await page.getByTestId('invite-create').click();
    await expect(page.getByText('Invitation created')).toBeVisible({ timeout: 30_000 });
    expect(
      queryDatabase(`select reference_entity from public.invites where email = '${email}';`).trim(),
    ).toBe('Creu Roja Osona');
    await page.getByTestId('invite-done').click();

    const id = inviteId();
    await expect(page.getByTestId(`invite-status-${id}`)).toHaveText('Pending', {
      timeout: 30_000,
    });

    // An expired invite is renewed for 30 more days.
    queryDatabase(
      `update public.invites set expires_at = now() - interval '1 day' where id = '${id}';`,
    );
    await page.reload();
    await expect(page.getByTestId(`invite-status-${id}`)).toHaveText('Expired', {
      timeout: 30_000,
    });
    await page.getByTestId(`invite-renew-${id}`).click();
    await expect(page.getByTestId(`invite-status-${id}`)).toHaveText('Pending', {
      timeout: 30_000,
    });
    expect(
      queryDatabase(
        `select expires_at > now() + interval '29 days' from public.invites where id = '${id}';`,
      ).trim(),
    ).toBe('t');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId(`invite-cancel-${id}`).click();
    await expect(page.getByTestId(`invite-row-${id}`)).toHaveCount(0, { timeout: 30_000 });
    expect(inviteId()).toBe('');
    expect(queryDatabase(`select count(*) from auth.users where email = '${email}';`).trim()).toBe(
      '0',
    );
  } finally {
    queryDatabase(`
      delete from public.invites where email = '${email}';
      delete from auth.users where email = '${email}';
    `);
  }
});
