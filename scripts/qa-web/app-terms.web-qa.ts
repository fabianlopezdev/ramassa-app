/**
 * App terms, editable and versioned (RAPP-613), end to end in real browsers:
 * an admin writes a draft on the onboarding page, sees the phone's screens in
 * Spanish and in Arabic (right to left), publishes it as version 2, and a
 * player who had joined meets the new terms alone on her next open, accepts
 * them, and reaches her home; when her terms cannot be read she sees the
 * bundled text and a retry. The design role writes drafts and cannot publish.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PLAYER_ORIGIN, queryDatabase, signIn, signInPlayer } from './session';

const RUN_TAG = Date.now().toString(36);
const NEW_BODY = `Texto legal nuevo ${RUN_TAG}.`;
const ORG = '5eed0000-0000-4000-8000-000000000000';
const PLAYER = '5eed0000-0000-4000-8000-000000000024';
const onboardingEs = JSON.parse(
  readFileSync('packages/shared/i18n/locales/es/onboarding.json', 'utf8'),
) as Record<string, string>;
const errorsEs = JSON.parse(
  readFileSync('packages/shared/i18n/locales/es/errors.json', 'utf8'),
) as Record<string, string>;

test.use({ actionTimeout: 15_000 });
test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  // A published version never changes or goes; the suite's own goes with the
  // trigger off, so the seeded organization is back at version 1.
  queryDatabase(`
    begin;
    set local session_replication_role = replica;
    delete from public.terms_acceptances
     where version_id in (select id from public.app_terms_versions where org_id = '${ORG}' and version_number > 1);
    delete from public.app_terms_versions where org_id = '${ORG}' and (version_number is null or version_number > 1);
    delete from public.audit_log where action like 'app_terms.%';
    commit;
  `);
});

test('the design role writes a draft but cannot publish it', async ({ page }) => {
  await signIn(page, 'disseny@example.test');
  // The legal text has its own screen editor on the board (RAPP-641).
  await page.goto('/onboarding/screens/terms');
  const editor = page.getByTestId('app-terms-editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await expect(editor.getByTestId('app-terms-publish')).toHaveCount(0);
  await editor.locator('#app-terms-body').fill(`Esborrany del disseny ${RUN_TAG}.`);
  await editor.getByTestId('app-terms-save').click();
  await expect
    .poll(() =>
      queryDatabase(
        `select content -> 'body' ->> 'ca' from public.app_terms_versions where org_id = '${ORG}' and published_at is null`,
      ),
    )
    .toBe(`Esborrany del disseny ${RUN_TAG}.`);
});

test('an admin previews the draft in each language and publishes it', async ({ page }) => {
  await signIn(page, 'laia.ferrer@example.test');
  // The legal text has its own screen editor on the board (RAPP-641).
  await page.goto('/onboarding/screens/terms');
  const editor = page.getByTestId('app-terms-editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  // The draft the design role saved opens here.
  await expect(editor.locator('#app-terms-body')).toHaveValue(`Esborrany del disseny ${RUN_TAG}.`);
  await editor.locator('#app-terms-body').fill(`Text legal nou ${RUN_TAG}.`);

  await editor.locator('#app-terms-language').selectOption('es');
  await editor.locator('#app-terms-body').fill(NEW_BODY);
  const preview = editor.getByTestId('app-terms-preview-terms');
  await expect(preview).toContainText(NEW_BODY);
  await expect(preview).toHaveAttribute('dir', 'ltr');

  await editor.locator('#app-terms-language').selectOption('ar');
  await expect(preview).toHaveAttribute('dir', 'rtl');
  await expect(editor.locator('#app-terms-body')).toHaveAttribute('dir', 'rtl');
  // Arabic emptied: the preview shows the Catalan text, and says so.
  await editor.locator('#app-terms-body').fill('');
  await expect(editor.getByTestId('app-terms-fallback')).toBeVisible();
  await expect(preview).toContainText(`Text legal nou ${RUN_TAG}.`);

  await editor.getByTestId('app-terms-save').click();
  await expect
    .poll(() =>
      queryDatabase(
        `select content -> 'body' ->> 'es' from public.app_terms_versions where org_id = '${ORG}' and published_at is null`,
      ),
    )
    .toBe(NEW_BODY);

  await editor.getByTestId('app-terms-publish').click();
  await expect(editor.getByRole('alert')).toBeVisible();
  await editor.getByTestId('app-terms-publish').click();
  await expect
    .poll(() =>
      queryDatabase(
        `select version_number from public.app_terms_versions where org_id = '${ORG}' and content -> 'body' ->> 'es' = '${NEW_BODY}'`,
      ),
    )
    .toBe('2');
  expect(
    queryDatabase(
      `select changes ->> 'version_number' from public.audit_log where action = 'app_terms.publish' order by created_at desc limit 1`,
    ),
  ).toBe('2');
  await expect(editor.getByTestId('app-terms-versions')).toContainText('2');
});

test('a player who joined accepts version 2 on its own screen, then reaches her home', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // First her terms cannot be read: she gets the bundled text and a retry,
  // never a spinner that locks her out (verifier finding 2).
  await page.route('**/rest/v1/rpc/intake_catalog*', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"down"}' }),
  );
  await signInPlayer(page, 'maria.rojas@example.test', 'es');
  await expect(page).toHaveURL(`${PLAYER_ORIGIN}/terms-update`, { timeout: 60_000 });
  await expect(page.getByText(onboardingEs.termsUpdateLoadFailed!)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('terms-update-acceptance')).toHaveCount(0);
  await expect(page.getByRole('button', { name: onboardingEs.termsDeclineAction })).toBeVisible();
  await page.unroute('**/rest/v1/rpc/intake_catalog*');
  await page.getByRole('button', { name: errorsEs.retry, exact: true }).click();
  await expect(page.getByText(NEW_BODY)).toBeVisible({ timeout: 30_000 });
  // No wizard: no progress, no other step.
  await page.getByTestId('terms-update-acceptance').click();
  await page.getByTestId('terms-update-cannot-draw').click();
  await page.getByRole('button', { name: onboardingEs.finishAction, exact: true }).click();
  await expect(page).not.toHaveURL(/\/terms-update$/, { timeout: 30_000 });
  expect(
    queryDatabase(
      `select t.terms_version || ':' || t.locale_shown from public.terms_acceptances t
         join public.app_terms_versions v on v.id = t.version_id
        where t.profile_id = '${PLAYER}' and v.version_number = 2`,
    ),
  ).toBe('2:es');
});
