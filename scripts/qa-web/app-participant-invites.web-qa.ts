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
    await page.getByTestId('invite-review').click();
    await expect(page.getByText('Write a valid email address.')).toBeVisible();
    // Her name creates her profile with the invite (RAPP-300).
    await page.getByTestId('invite-first-name').fill('Qa');
    await page.getByTestId('invite-last-name').fill('Telefon');
    await page.getByTestId('invite-email').fill(email);
    await page.getByTestId('invite-entity-Creu Roja Osona').click();
    await page.getByTestId('invite-review').click();

    // The last step shows what she will be asked before the invite exists (RAPP-618).
    await expect(page.getByTestId('invite-questions-step')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('invite-question-reference_entity-status')).toContainText(
      'She is not asked',
    );
    await expect(page.getByTestId('invite-question-date_of_birth-status')).toContainText(
      'She is asked',
    );
    // Don't ask is not offered on a required question nobody answered.
    await expect(page.getByTestId('invite-question-date_of_birth-skip')).toHaveCount(0);
    expect(
      queryDatabase(`select count(*) from public.invites where email = '${email}';`).trim(),
    ).toBe('0');
    await page.getByTestId('invite-question-phone-skip').click();
    await expect(page.getByTestId('invite-question-phone-status')).toContainText(
      'She is not asked',
    );
    await page.getByTestId('invite-create').click();
    await expect(page.getByText('Invitation created')).toBeVisible({ timeout: 30_000 });
    expect(
      queryDatabase(`select reference_entity from public.invites where email = '${email}';`).trim(),
    ).toBe('Creu Roja Osona');
    expect(
      queryDatabase(
        `select string_agg(s.question || ':' || s.state, ',') from public.intake_question_states s
           join auth.users u on u.id = s.profile_id where u.email = '${email}';`,
      ).trim(),
    ).toBe('phone:skip');
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
