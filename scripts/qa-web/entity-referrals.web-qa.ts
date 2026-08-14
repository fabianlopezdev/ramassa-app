/**
 * Entity referral intake, staff completion, participant linkage and updates,
 * exercised through the same browser paths people use (RAPP-54).
 */

import { expect, test, type Page } from '@playwright/test';
import { ENTITY_EMAIL, OTHER_ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

const RUN_TAG = `rapp54${Date.now().toString(36)}`;
const ENTITY_USER_ID = '5eed0000-0000-4000-8000-000000000004';
const STAFF_USER_ID = '5eed0000-0000-4000-8000-000000000002';
const FIRST_NAME = 'أمينة Наталія';
const LAST_NAME = `Àlvarez ${RUN_TAG}`;
const EMAIL = `nataliia.${RUN_TAG}@example.test`;
const NOTES = `<script>alert(54)</script> Suport d'habitatge العربية ${RUN_TAG}`;
const UPDATE = `<img src=x onerror=alert(54)> Ha començat català amb أمينة ${RUN_TAG}`;

let referralId = '';
let participantId = '';
let updateId = '';
let expectedStaffDeliveries = 0;

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function createAccountFromReferral(page: Page): Promise<void> {
  await page.getByTestId(`complete-referral-${referralId}`).click();
  await expect(page.getByTestId('referral-prefill')).toContainText(FIRST_NAME);
  await page
    .getByRole('button', { name: /no, (no té correu|she has no email|no tiene correo)/i })
    .click();
  await expect(page.locator('#new-participant-first-name')).toHaveValue(FIRST_NAME);
  await expect(page.locator('#new-participant-last-name')).toHaveValue(LAST_NAME);
  await page
    .getByRole('button', { name: /crea el compte|create the account|crea la cuenta/i })
    .click();
  await expect(
    page.getByRole('heading', { name: /compte creat|account created|cuenta creada/i }),
  ).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('entity referral product flow', () => {
  test.afterAll(() => {
    if (referralId.length === 0) return;
    queryDatabase(`
      begin;
      create temporary table qa_referral_updates on commit drop as
        select id from public.referral_updates where referral_id = ${sqlLiteral(referralId)};
      create temporary table qa_referral_publications on commit drop as
        select id from public.push_publications
         where content_type = 'referral_update'
           and content_id in (select id from qa_referral_updates);
      delete from public.push_deliveries
       where publication_id in (select id from qa_referral_publications);
      delete from public.push_publications
       where id in (select id from qa_referral_publications);
      delete from public.push_tokens where device_id = ${sqlLiteral(RUN_TAG)};
      delete from public.audit_log where target_id = nullif(${sqlLiteral(participantId)}, '')::uuid;
      delete from public.entity_referrals where id = ${sqlLiteral(referralId)};
      delete from public.profiles where id = nullif(${sqlLiteral(participantId)}, '')::uuid;
      delete from auth.identities where user_id = nullif(${sqlLiteral(participantId)}, '')::uuid;
      delete from auth.users where id = nullif(${sqlLiteral(participantId)}, '')::uuid;
      commit;
    `);
  });

  test('an entity submits multilingual minimal data and can search the durable result', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, ENTITY_EMAIL);
    await page.goto('/portal/referrals');

    const expectedInitialCount = Number(
      queryDatabase(
        `select count(*) from public.entity_referrals where entity_user_id = ${sqlLiteral(ENTITY_USER_ID)}`,
      ),
    );
    await expect(page.getByTestId('entity-referral-list').locator('> li')).toHaveCount(
      expectedInitialCount,
    );

    await page.getByTestId('referral-new').click();
    await page.locator('#referral-first-name').fill('أمي');
    await expect(page.locator('#referral-first-name')).toHaveValue('أمي');
    await page.locator('#referral-first-name').fill(FIRST_NAME);
    await page.locator('#referral-last-name').fill(LAST_NAME);
    await page.locator('#referral-email').fill(EMAIL);
    await page.locator('#referral-documentation').selectOption('in_progress');
    await page.locator('#referral-notes').fill(NOTES);
    await page.getByTestId('referral-submit').click();
    await expect(page).toHaveURL(/\/portal\/referrals\/[0-9a-f-]+$/, { timeout: 30_000 });

    referralId = queryDatabase(
      `select id from public.entity_referrals
        where entity_user_id = ${sqlLiteral(ENTITY_USER_ID)}
          and referred_last_name = ${sqlLiteral(LAST_NAME)}`,
    );
    expect(referralId).not.toBe('');
    expect(
      queryDatabase(
        `select referred_first_name || '|' || referred_last_name || '|' ||
                public.decrypt_field(referred_email) || '|' || documentation_status || '|' ||
                public.decrypt_field(notes) || '|' || status
           from public.entity_referrals where id = ${sqlLiteral(referralId)}`,
      ),
    ).toBe(`${FIRST_NAME}|${LAST_NAME}|${EMAIL}|in_progress|${NOTES}|pending`);
    await expect(page.getByText(NOTES)).toBeVisible();
    await expect(page.locator('script').filter({ hasText: NOTES })).toHaveCount(0);

    await page.reload();
    await expect(page.getByText(NOTES)).toBeVisible();
    await page.getByRole('link', { name: /torna a les derivacions|back to referrals/i }).click();

    const search = page.getByTestId('referral-search');
    await search.fill('أمي');
    await expect(page.getByText(LAST_NAME)).toBeVisible();
    await search.fill('Нат');
    await expect(page.getByText(LAST_NAME)).toBeVisible();
    await search.fill('alv');
    await expect(page.getByText(LAST_NAME)).toBeVisible();
    await search.fill(`cap-resultat-${RUN_TAG}`);
    await expect(page.getByTestId('referral-search-empty')).toBeVisible();
    await page.reload();
    await expect(search).toHaveValue(`cap-resultat-${RUN_TAG}`);
    await expect(page.getByTestId('referral-search-empty')).toBeVisible();
    await page.goBack();
    await expect(page.getByText(NOTES)).toBeVisible();
  });

  test('staff completes onboarding, then the update reaches status, timeline and staff push', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, STAFF_EMAIL);
    await page.goto('/participants/referrals');
    const expectedName = queryDatabase(
      `select referred_first_name || ' ' || referred_last_name
         from public.entity_referrals where id = ${sqlLiteral(referralId)}`,
    );
    await expect(page.getByText(expectedName)).toBeVisible();
    await createAccountFromReferral(page);

    participantId = queryDatabase(
      `select referred_profile_id from public.entity_referrals where id = ${sqlLiteral(referralId)}`,
    );
    expect(participantId).not.toBe('');
    expect(
      queryDatabase(
        `select status || '|' || referred_profile_id || '|' || assigned_staff_id
           from public.entity_referrals where id = ${sqlLiteral(referralId)}`,
      ),
    ).toBe(`active|${participantId}|${STAFF_USER_ID}`);

    await signIn(page, ENTITY_EMAIL);
    await page.goto(`/portal/referrals/${referralId}`);
    const expectedStatus = queryDatabase(
      `select status from public.entity_referrals where id = ${sqlLiteral(referralId)}`,
    );
    await expect(
      page.getByText(
        expectedStatus === 'active' ? /participant activa|active participant/i : expectedStatus,
      ),
    ).toBeVisible();
    queryDatabase(
      `insert into public.push_tokens (user_id, token, platform, device_id)
       values (
         ${sqlLiteral(STAFF_USER_ID)},
         ${sqlLiteral(`ExponentPushToken[${RUN_TAG}]`)},
         'web',
         ${sqlLiteral(RUN_TAG)}
       )
       on conflict (user_id, device_id) do update set token = excluded.token`,
    );
    expectedStaffDeliveries = Number(
      queryDatabase(
        `select count(*) from public.push_tokens where user_id = ${sqlLiteral(STAFF_USER_ID)}`,
      ),
    );
    await page.locator('#referral-update-type').selectOption('education');
    await page.locator('#referral-update-content').fill(UPDATE);
    await page.getByTestId('referral-update-submit').click();
    await expect(page.getByText(UPDATE)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('img[src="x"]')).toHaveCount(0);

    updateId = queryDatabase(
      `select id from public.referral_updates
        where referral_id = ${sqlLiteral(referralId)}
          and public.decrypt_field(content) = ${sqlLiteral(UPDATE)}`,
    );
    expect(updateId).not.toBe('');
    await page.reload();
    await expect(page.getByText(UPDATE)).toBeVisible();

    await signIn(page, STAFF_EMAIL);
    await page.goto(`/participants/${participantId}`);
    await expect(
      page.getByTestId(`participant-activity-referral_update-${updateId}`),
    ).toContainText(UPDATE);
    expect(
      queryDatabase(
        `select count(*) || '|' || min(recipient_id::text)
           from public.push_publications
          where content_type = 'referral_update' and content_id = ${sqlLiteral(updateId)}`,
      ),
    ).toBe(`1|${STAFF_USER_ID}`);
    expect(
      queryDatabase(
        `select count(*) || '|' || min(delivery.recipient_id::text)
           from public.push_deliveries as delivery
           join public.push_publications as publication on publication.id = delivery.publication_id
          where publication.content_type = 'referral_update'
            and publication.content_id = ${sqlLiteral(updateId)}`,
      ),
    ).toBe(`${expectedStaffDeliveries}|${STAFF_USER_ID}`);
  });

  test('the product keeps other entities, staff and players outside the wrong referral area', async ({
    page,
  }) => {
    await signIn(page, OTHER_ENTITY_EMAIL);
    await page.goto('/portal/referrals');
    await expect(page.getByText(LAST_NAME)).toHaveCount(0);
    await page.goto(`/portal/referrals/${referralId}`);
    await expect(page.getByText(LAST_NAME)).toHaveCount(0);

    await signIn(page, ENTITY_EMAIL);
    await page.goto('/participants/referrals');
    await expect(page).toHaveURL(/\/portal(?:\/|$)/);

    await signIn(page, STAFF_EMAIL);
    await page.goto('/portal/referrals');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
