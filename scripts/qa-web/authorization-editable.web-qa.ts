/**
 * The season authorization fully editable (RAPP-614), end to end in real
 * browsers. The design role defines a consent in Dades legals, worded in
 * Catalan and Arabic, places it required on the consents screen with the
 * shared picker (RAPP-699), makes the health field of the Health screen
 * optional (a placement since RAPP-698) and rewords the final button in Catalan, and saves a draft she cannot publish.
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
// Its key is its Catalan name, written plain (RAPP-699).
const CONSENT_NAME = "Fotos d'equip prova";
const CONSENT_KEY = 'fotos_d_equip_prova';
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
    delete from public.custom_answers a
     using public.profile_fields f
     where f.id = a.question_id and a.profile_id = '${PLAYER}'
       and f.system_key = any (private.authorization_field_keys());
    update public.field_placements pl set required = (f.system_key = 'health_info')
      from public.profile_fields f
     where f.id = pl.field_id and pl.surface = 'authorization' and f.org_id = '${ORG}';
    delete from public.audit_log
     where created_at >= '${startedAt}'::timestamptz and action like 'authorization.%';
    set local ramassa.consent_event_erasure = 'on';
    delete from public.consent_events where consent_key = '${CONSENT_KEY}';
    delete from public.consents where org_id = '${ORG}' and key = '${CONSENT_KEY}';
    commit;
  `);
}

test.beforeAll(cleanUp);
test.afterAll(cleanUp);

test('the design role adds a required consent and saves a draft she cannot publish', async ({
  page,
}) => {
  await signIn(page, ONBOARDING_DESIGNER_EMAIL);
  // The Health screen's fields are placements (RAPP-698): the health field
  // made optional there, saved at once like any screen's.
  await page.goto('/forms/authorization/health');
  const healthEditor = page.getByTestId('authorization-editor');
  await expect(healthEditor).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('screen-questions')).toBeVisible();
  queryDatabase(`
    update public.field_placements pl set required = false
      from public.profile_fields f
     where f.id = pl.field_id and pl.surface = 'authorization' and f.org_id = '${ORG}'
       and f.system_key = 'health_info';
  `);

  // Dades legals: the consent, defined once in Catalan and Arabic (RAPP-699).
  await page.goto('/legal-data');
  await page.getByTestId('legal-consent-add').click({ timeout: 30_000 });
  const form = page.getByTestId('legal-consent-form');
  await form.locator('[name="consent-name.ca"]').fill(CONSENT_NAME);
  await form.locator('[name="consent-body.ca"]').fill(CONSENT_CA);
  await form
    .getByTestId('legal-consent-form-language')
    .getByRole('radio', { name: 'العربية' })
    .click();
  await form.locator('[name="consent-body.ar"]').fill(CONSENT_AR);
  await form.getByTestId('legal-consent-form-save').click();
  await expect(page.getByTestId(`legal-consent-${CONSENT_KEY}`)).toBeVisible();

  // The consents and signature screen places it with the shared picker, required.
  await page.goto('/forms/authorization/consents');
  const editor = page.getByTestId('authorization-editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.getByTestId('screen-consents-add').click();
  await page.getByTestId(`field-picker-consent-${CONSENT_KEY}`).click();
  await page.getByTestId('field-picker-confirm').click();
  await editor.getByTestId(`consent-required-${CONSENT_KEY}`).click();
  await editor.getByTestId('editor-language').getByRole('radio', { name: 'Català' }).click();
  await editor.locator('#authorization-text-sign_and_enter_label').fill('Signa i juga');
  await editor.getByTestId('editor-language').getByRole('radio', { name: 'العربية' }).click();
  // Her phone, on the consents screen, in the editor's frame (RAPP-695).
  await expect(page.getByTestId('phone-screen')).toContainText(CONSENT_AR);
  await expect(page.getByTestId('phone-screen')).toHaveAttribute('dir', 'rtl');

  await editor.getByTestId('authorization-save').click();
  await expect
    .poll(() =>
      queryDatabase(
        `select content -> 'consents' -> '${CONSENT_KEY}' ->> 'required'
           from public.authorization_versions where org_id = '${ORG}' and published_at is null`,
      ),
    )
    .toBe('true');
  await expect(editor.getByTestId('authorization-publish')).toHaveCount(0);
  await page.goto('/forms/authorization');
  await expect(page.getByTestId('authorization-draft-row')).toBeVisible({ timeout: 30_000 });
  expect(
    queryDatabase(
      `select count(*) from public.audit_log where action = 'authorization.draft_saved'
          and created_at >= '${startedAt}'::timestamptz`,
    ),
  ).toBe('1');
});

test('an admin saves the draft as a new version everyone signs', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  // Any screen of the authorization's board saves the whole form (RAPP-696).
  await page.goto('/forms/authorization/consents');
  const editor = page.getByTestId('authorization-editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.getByTestId('authorization-publish').click();
  // Players signed version 1, so Desa asks: a new version asks them again.
  await page.getByTestId('save-kind-new').click();
  await page.getByTestId('save-kind-confirm').click();
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
  // The health field is optional now: she goes on without answering it.
  await action.click();
  await expect(player.getByTestId(`authorization-consent-${CONSENT_KEY}`)).toContainText(
    CONSENT_AR,
  );
  // Staff reworded the button in Catalan only: in Arabic the app's own words show.
  await expect(action).toHaveText(ar.authorizationSignAndEnterAction!);
  for (const consent of [
    'participation',
    'data_processing',
    'code_of_conduct',
    'health_data',
    CONSENT_KEY,
  ])
    await player.getByTestId(`authorization-consent-${consent}`).click();
  await player.getByTestId('authorization-cannot-draw').click();
  await action.click();
  await expect(player.getByTestId('authorization-sign')).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() =>
      queryDatabase(
        `select e.wording || '|' || e.language || '|' || e.granted
           from public.consent_events e
          where e.profile_id = '${PLAYER}' and e.consent_key = '${CONSENT_KEY}'`,
      ),
    )
    .toBe(`${CONSENT_AR}|ar|true`);

  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/participants/${PLAYER}`);
  const consents = page.getByTestId('participant-consents');
  await expect(consents).toContainText(CONSENT_AR, { timeout: 30_000 });
  await expect(consents.getByText(CONSENT_AR)).toHaveAttribute('lang', 'ar');
});
