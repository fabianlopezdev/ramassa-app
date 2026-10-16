/**
 * Walk-ins on the dashboard (RAPP-305): women who signed the authorization on a
 * staff tablet before they were in Ramassà wait for review. Staff merge one into
 * a player who is already in Ramassà, or discard one. Confirming needs a fresh
 * authenticator code and is covered by the database tests. Every expected
 * value comes from psql; the seed is put back afterwards.
 */

import { expect, test } from '@playwright/test';
import { queryDatabase, signIn } from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';
const SALMA = '5eed0000-0000-4000-8043-000000000001';
// Наталія has not signed 2026/27 in the seed.
const NATALIIA = '5eed0000-0000-4000-8000-000000000022';
const DISCARDED = '5eed0000-0000-4000-8043-0000000000aa';

test.beforeAll(() => {
  queryDatabase(`
    insert into public.walk_in_signings
      (id, org_id, first_name, last_name, version_id, payload, signed_at, collected_by)
    values ('${DISCARDED}', '5eed0000-0000-4000-8000-000000000000', 'Duplicada', 'Prova',
            '5eed0000-0000-4000-8041-000000000001', null, now(),
            '5eed0000-0000-4000-8000-000000000002')
    on conflict (id) do nothing;
  `);
});

test.afterAll(() => {
  queryDatabase(`
    delete from public.walk_in_signings where id = '${DISCARDED}';
    delete from public.authorization_consent_events
     where signature_id in (select id from public.authorization_signatures
                             where profile_id = '${NATALIIA}' and method = 'staff_device');
    delete from public.authorization_signatures
     where profile_id = '${NATALIIA}' and method = 'staff_device';
    update public.walk_in_signings
       set status = 'pending', resolved_profile_id = null, resolved_by = null, resolved_at = null,
           payload = public.encrypt_field(jsonb_build_object(
             'consents', jsonb_build_object('participation', true, 'data_processing', true,
                                            'code_of_conduct', true, 'health_data', true,
                                            'image_rights', false, 'newsletter', false,
                                            'messaging_groups', true),
             'health_info', 'No', 'unable_to_draw', true, 'language', 'ar', 'device', 'iPad')::text)
     where id = '${SALMA}';
  `);
});

test('staff discard a walk-in signed by mistake', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/participants/walk-ins');
  const row = page.getByTestId(`walk-in-${DISCARDED}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  page.once('dialog', (dialog) => void dialog.accept());
  await row.getByRole('button', { name: /discard|descarta/i }).click();
  await expect
    .poll(
      () =>
        queryDatabase(
          `select status || '|' || (payload is null)::text from public.walk_in_signings where id = '${DISCARDED}'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('discarded|true');
  await expect(row).toHaveCount(0);
});

test('staff merge a walk-in into the player she already is', async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto('/participants/walk-ins');
  const row = page.getByTestId(`walk-in-${SALMA}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.locator('select[name="profileId"]').selectOption(NATALIIA);
  await row.getByRole('button', { name: /^(merge|uneix)$/i }).click();

  await expect
    .poll(
      () =>
        queryDatabase(
          `select method || '|' || witnessed_by::text from public.authorization_signatures
            where profile_id = '${NATALIIA}' and method = 'staff_device'`,
        ),
      { timeout: 15_000 },
    )
    .toBe('staff_device|5eed0000-0000-4000-8000-000000000002');
  expect(queryDatabase(`select status from public.walk_in_signings where id = '${SALMA}'`)).toBe(
    'merged',
  );
});
