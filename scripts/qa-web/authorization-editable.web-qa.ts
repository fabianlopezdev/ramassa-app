/**
 * The season authorization fully editable (RAPP-614), end to end in real
 * browsers. On the onboarding page the design role adds a required consent
 * worded in Catalan and Arabic, makes the health question optional and
 * rewords the final button in Catalan, and saves a draft she cannot publish.
 * An admin publishes it. A player who has not signed meets it on her phone in
 * Arabic: the new consent in its place, the app's own Arabic button where
 * staff wrote only Catalan. She signs, and her page lists the consent with
 * the Arabic words she was shown.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ONBOARDING_DESIGNER_EMAIL } from '@ramassa/shared/testing';
import { queryDatabase, signIn, signInPlayer } from './session';

const ORG = '5eed0000-0000-4000-8000-000000000000';
const ADMIN_EMAIL = 'laia.ferrer@example.test';
const PLAYER_EMAIL = 'nataliia.shevchenko@example.test';
const PLAYER = '5eed0000-0000-4000-8000-000000000022';
const CONSENT_CA = 'Accepto les fotos d’equip (prova)';
const CONSENT_AR = 'أوافق على صور الفريق';
const startedAt = new Date().toISOString();
const ar = JSON.parse(
  readFileSync('packages/shared/i18n/locales/ar/onboarding.json', 'utf8'),
) as Record<string, string>;

test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: 'serial' });

function cleanUp(): void {
  // A published version never changes or goes; this one only existed for the spec.
  queryDatabase(`
    begin;
    delete from public.authorization_signatures
     where profile_id = '${PLAYER}' and signed_at >= '${startedAt}'::timestamptz;
    alter table public.authorization_versions disable trigger authorization_versions_immutable;
    delete from public.authorization_versions
     where org_id = '${ORG}' and (published_at is null or version_number > 1);
    alter table public.authorization_versions enable trigger authorization_versions_immutable;
    update public.profiles set health_info = null, emergency_contact_name = null,
           emergency_contact_relation = null, emergency_contact_phone = null
     where id = '${PLAYER}';
    delete from public.audit_log
     where created_at >= '${startedAt}'::timestamptz and action like 'authorization.%';
    commit;
  `);
}

test.beforeAll(cleanUp);
test.afterAll(cleanUp);

test('the design role adds a required consent and saves a draft she cannot publish', async ({
  page,
}) => {
  await signIn(page, ONBOARDING_DESIGNER_EMAIL);
  await page.goto('/onboarding');
  const editor = page.getByTestId('authorization-editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });

  await editor.locator('#authorization-language').selectOption('ca');
  await editor.getByTestId('authorization-consent-add').click();
  await editor.locator('#authorization-consent-label-consent_8').fill(CONSENT_CA);
  await editor.locator('#authorization-consent-required-consent_8').check();
  await editor.locator('#authorization-text-sign_and_enter_label').fill('Signa i juga');
  // The health question optional: its consent may stay required.
  await editor.locator('#authorization-health-required').uncheck();
  await editor.locator('#authorization-language').selectOption('ar');
  await expect(editor.locator('#authorization-consent-label-consent_8')).toHaveAttribute(
    'dir',
    'rtl',
  );
  await editor.locator('#authorization-consent-label-consent_8').fill(CONSENT_AR);
  await expect(page.getByTestId('authorization-preview-consents')).toContainText(CONSENT_AR);
  await expect(page.getByTestId('authorization-preview-consents')).toHaveAttribute('dir', 'rtl');

  await editor.getByTestId('authorization-save').click();
  await expect
    .poll(() =>
      queryDatabase(
        `select (content -> 'consents' -> 'consent_8' ->> 'required') || '|' ||
                (content -> 'questions' -> 'health' ->> 'required')
           from public.authorization_versions where org_id = '${ORG}' and published_at is null`,
      ),
    )
    .toBe('true|false');
  await expect(editor.getByTestId('authorization-draft-row')).toBeVisible();
  await expect(editor.getByTestId('authorization-publish')).toHaveCount(0);
  expect(
    queryDatabase(
      `select count(*) from public.audit_log where action = 'authorization.draft_saved'
          and created_at >= '${startedAt}'::timestamptz`,
    ),
  ).toBe('1');
});

test('an admin publishes the draft after confirming', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/onboarding');
  const editor = page.getByTestId('authorization-editor');
  await expect(editor.getByTestId('authorization-draft-row')).toBeVisible({ timeout: 30_000 });
  await editor.getByTestId('authorization-publish').click();
  await editor.getByTestId('authorization-publish').click();
  await expect
    .poll(() =>
      queryDatabase(
        `select version_number from public.authorization_versions
          where org_id = '${ORG}' and published_at is not null order by version_number desc limit 1`,
      ),
    )
    .toBe('2');
  expect(
    queryDatabase(
      `select count(*) from public.authorization_versions where org_id = '${ORG}' and published_at is null`,
    ),
  ).toBe('0');
});

test('in Arabic she meets the new consent, signs, and her page shows its words', async ({
  browser,
  page,
}) => {
  test.setTimeout(240_000);
  const player = await (await browser.newContext({ locale: 'ar' })).newPage();
  await signInPlayer(player, PLAYER_EMAIL, 'ar');
  const action = player.getByTestId('authorization-sign');
  await expect(action).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() =>
      player.getByTestId('auth-scroll-content').evaluate((element) => {
        // The same reach-the-end scroll as the onboarding closure spec.
        if (
          !('scrollTop' in element) ||
          typeof element.scrollTop !== 'number' ||
          !('scrollHeight' in element) ||
          typeof element.scrollHeight !== 'number'
        )
          return false;
        element.scrollTop = element.scrollHeight;
        return typeof element.scrollTop === 'number' && element.scrollTop > 0;
      }),
    )
    .toBe(true);
  await action.click();
  // The health question is optional now: she goes on without answering it.
  await action.click();
  await expect(player.getByTestId('authorization-consent-consent_8')).toContainText(CONSENT_AR);
  // Staff reworded the button in Catalan only: in Arabic the app's own words show.
  await expect(action).toHaveText(ar.authorizationSignAndEnterAction!);
  for (const consent of [
    'participation',
    'data_processing',
    'code_of_conduct',
    'health_data',
    'consent_8',
  ])
    await player.getByTestId(`authorization-consent-${consent}`).click();
  await player.getByTestId('authorization-cannot-draw').click();
  await action.click();
  await expect(player.getByTestId('authorization-sign')).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() =>
      queryDatabase(
        `select e.wording || '|' || e.language || '|' || e.granted
           from public.authorization_consent_events e
          where e.profile_id = '${PLAYER}' and e.consent_key = 'consent_8'`,
      ),
    )
    .toBe(`${CONSENT_AR}|ar|true`);

  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/participants/${PLAYER}`);
  const consents = page.getByTestId('participant-consents');
  await expect(consents).toContainText(CONSENT_AR, { timeout: 30_000 });
  await expect(consents.getByText(CONSENT_AR)).toHaveAttribute('lang', 'ar');
});
