/**
 * Editing a participant's record as a team member who may not see her
 * sensitive fields (RAPP-320).
 *
 * Such a person gets no document number, phone, address or postal code from
 * `get_participant_profile`. The database keeps the stored values when she
 * saves and checks the document rule on the stored number. The form has to do
 * its part: it hides the four fields, says why, and does not refuse to save a
 * participant with a NIE because of a number it was never shown.
 *
 * The permission is removed for the spec and put back after it, the way the
 * phone app's profile spec lowers a level.
 */

import { expect, test } from '@playwright/test';
import { queryDatabase, signIn } from './session';

const LIMITED_EMAIL = 'nuria.serra@example.test';
const SEED_ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const SENSITIVE_PERMISSION = 'participants.view_sensitive';

/** A participant with a NIE, so the document rule applies to her. */
const participantId = () =>
  queryDatabase(`
    select id from public.profiles
     where role = 'player' and last_name = 'Mamani' and document_type = 'nie';
  `).trim();

const storedSensitiveValues = (id: string) =>
  queryDatabase(`
    select concat_ws('|', public.decrypt_field(document_number), public.decrypt_field(phone),
                     public.decrypt_field(address), public.decrypt_field(postal_code))
      from public.profiles where id = '${id}';
  `);

const placeOfBirth = (id: string) =>
  queryDatabase(`select place_of_birth from public.profiles where id = '${id}';`);

test.describe('editing a record without the sensitive fields', () => {
  let hadSensitivePermission = false;

  test.beforeEach(() => {
    hadSensitivePermission =
      queryDatabase(`
        select count(*) from public.team_member_permissions
         where profile_id = (select id from auth.users where email = '${LIMITED_EMAIL}')
           and permission_code = '${SENSITIVE_PERMISSION}';
      `) !== '0';
    queryDatabase(`
      delete from public.team_member_permissions
       where profile_id = (select id from auth.users where email = '${LIMITED_EMAIL}')
         and permission_code = '${SENSITIVE_PERMISSION}';
    `);
  });

  test.afterEach(() => {
    if (!hadSensitivePermission) return;
    queryDatabase(`
      insert into public.team_member_permissions (profile_id, org_id, permission_code)
      select id, '${SEED_ORG_ID}', '${SENSITIVE_PERMISSION}'
        from auth.users where email = '${LIMITED_EMAIL}'
      on conflict do nothing;
    `);
  });

  test('a participant with a NIE saves, and her stored sensitive values stay', async ({ page }) => {
    const id = participantId();
    expect(id, 'no seeded participant Mamani with a NIE').not.toBe('');
    const sensitiveBefore = storedSensitiveValues(id);
    const originalPlace = placeOfBirth(id);
    const nextPlace = originalPlace === 'Oruro' ? 'Potosí' : 'Oruro';

    try {
      await signIn(page, LIMITED_EMAIL);
      await page.goto(`/participants/${id}`);
      await expect(page.getByRole('heading', { level: 1, name: /Mamani/ })).toBeVisible();
      await page.getByRole('button', { name: /edita|edit/i }).click();

      await page.locator('#participant-placeOfBirth').fill(nextPlace);
      await page.getByRole('button', { name: /desa|save|guarda/i }).click();

      await expect.poll(() => placeOfBirth(id), { timeout: 15_000 }).toBe(nextPlace);
      expect(storedSensitiveValues(id)).toBe(sensitiveBefore);
    } finally {
      queryDatabase(
        `update public.profiles set place_of_birth = '${originalPlace}' where id = '${id}';`,
      );
    }
  });

  test('the form hides the four sensitive fields and says so', async ({ page }) => {
    const id = participantId();

    await signIn(page, LIMITED_EMAIL);
    await page.goto(`/participants/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: /Mamani/ })).toBeVisible();
    await page.getByRole('button', { name: /edita|edit/i }).click();

    await expect(page.locator('#participant-placeOfBirth')).toBeVisible();
    for (const field of ['documentNumber', 'phone', 'address', 'postalCode']) {
      await expect(page.locator(`#participant-${field}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('participant-edit-sensitive-hidden')).toBeVisible();
    // The document TYPE is not sensitive: she can still be moved to "no document".
    await expect(page.locator('#participant-documentType')).toBeVisible();
  });
});
