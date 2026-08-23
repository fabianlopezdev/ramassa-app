/**
 * Deactivating, anonymizing and erasing a participant, driven the way a staff
 * member drives it (RAPP-26).
 *
 * THIS FILE DESTROYS ROWS ON PURPOSE, which makes it different from every other
 * spec in this suite and dictates its shape:
 *
 *   - It never touches a seeded participant. Each spec MINTS its own, through
 *     the real account-creation screen, tagged with this run's suffix, and that
 *     is the row it destroys. A suite that erased Amina al-Hassan would pass
 *     exactly once.
 *   - Every post-destruction check waits for something PRESENT before asserting
 *     something ABSENT. Playwright's `toHaveCount(0)` and `not.toBeVisible()`
 *     succeed the instant they are true, which on a page that has not rendered
 *     is immediately, so an erasure spec is almost entirely made of assertions
 *     that pass against a screen doing nothing at all. This is the trap that
 *     caught RAPP-25.
 *   - The database is the authority on what happened, never the screen. The
 *     screen is the authority on what a person can DO, which is the other half
 *     and why this is a browser spec rather than more pgTAP.
 *
 * It also needs the media Worker running (playwright.config.ts starts it):
 * Postgres refuses to erase a record without a receipt the Worker writes, so
 * without it this file could only ever assert the refusal.
 */

import { expect, test, type Page } from '@playwright/test';
import {
  accessTokenFor,
  countInDatabase,
  queryDatabase,
  signIn,
  STAFF_EMAIL,
  uploadObjectAs,
} from './session';

const ADMIN_EMAIL = 'laia.ferrer@example.test';

/** Unique to this run, so leftovers from a failure are identifiable. */
const RUN_TAG = `qa${Date.now().toString(36)}`;

/**
 * Every participant this file minted, remembered BY ID as it goes.
 *
 * By id, and not by matching this run's tag on `last_name`, which is what the
 * first version did: anonymization CLEARS the last name, so the one participant
 * the suite anonymized survived its own cleanup, accumulated across runs, and
 * broke an unrelated seed-count assertion in pgTAP two files away. The tag lived
 * in the very column the feature under test destroys.
 *
 * Cleaning up is not tidiness here. Account creation is capped at 20 an hour per
 * actor off the audit trail, so a suite that mints a participant per spec and
 * leaves them behind turns green into red after a few runs of the day, and it
 * fails looking exactly like a broken screen.
 */
const mintedParticipantIds: string[] = [];

test.afterAll(() => {
  if (mintedParticipantIds.length === 0) return;
  const ids = mintedParticipantIds.map((id) => `'${id}'`).join(', ');
  queryDatabase(`
    begin;
    delete from public.audit_log where target_id in (${ids}) or actor_id in (${ids});
    delete from public.invites where accepted_by in (${ids});
    -- Cascades to profiles, notes, tokens, consents and requests, exactly as the
    -- erasure under test does.
    delete from auth.users where id in (${ids});
    commit;
  `);
});

/**
 * A participant of this run's own, made through the real screen, with the rows
 * an erasure has to reach: a staff note, a device token, a consent record and an
 * erasure request she raised herself.
 *
 * The account comes from the product; the four attached rows are inserted
 * directly, because the features that create them are later phases and a spec
 * that waited for them would assert nothing today about the tables the registry
 * already covers.
 */
async function createParticipantWithData(
  page: Page,
  firstName: string,
): Promise<{ readonly id: string; readonly email: string; readonly password: string }> {
  await page.goto('/participants/new');
  await page
    .getByRole('button', { name: /no, (no té correu|she has no email|no tiene correo)/i })
    .click();
  await page.locator('#new-participant-first-name').fill(firstName);
  await page.locator('#new-participant-last-name').fill(`Rgpd ${RUN_TAG}`);
  await page
    .getByRole('button', { name: /crea el compte|create the account|crea la cuenta/i })
    .click();

  const panel = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: /compte creat|account created|cuenta creada/i }),
    })
    .last();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const email = (await panel.locator('code').nth(0).innerText()).trim();
  const password = (await panel.locator('code').nth(1).innerText()).trim();
  const id = queryDatabase(`select id from auth.users where email = '${email}'`);
  expect(id).not.toBe('');
  // Recorded BEFORE the attached rows exist, so a spec that fails halfway still
  // leaves a row this file knows how to remove.
  mintedParticipantIds.push(id);

  queryDatabase(`
    insert into public.participant_notes (profile_id, author_id, body)
      values ('${id}', '5eed0000-0000-4000-8000-000000000002', 'Nota de prova ${RUN_TAG}');
    insert into public.push_tokens (user_id, token, platform, device_id)
      values ('${id}', 'tok-${RUN_TAG}-${firstName}', 'android', 'dev-${RUN_TAG}-${firstName}');
    insert into public.terms_acceptances (profile_id, terms_version, locale_shown)
      values ('${id}', 'v1', 'ca');
    insert into public.deletion_requests (profile_id, reason)
      values ('${id}', 'Vull que esborreu les meves dades. ${RUN_TAG}');
  `);

  return { id, email, password };
}

/** How many rows anywhere in the schema still point at her, per the database. */
function rowsAttachedTo(participantId: string): number {
  return countInDatabase(`
    select
      (select count(*) from public.profiles where id = '${participantId}') +
      (select count(*) from public.participant_notes where profile_id = '${participantId}') +
      (select count(*) from public.push_tokens where user_id = '${participantId}') +
      (select count(*) from public.terms_acceptances where profile_id = '${participantId}') +
      (select count(*) from public.deletion_requests where profile_id = '${participantId}') +
      (select count(*) from auth.users where id = '${participantId}')
  `);
}

async function openConfirmDialog(page: Page, action: RegExp): Promise<void> {
  await page.getByRole('button', { name: action }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByRole('textbox')).toBeFocused();
}

/**
 * The word this dialog is asking for, READ OFF THE DIALOG.
 *
 * Not hardcoded, and the first version of this file was: it typed the Catalan
 * words while the suite runs under `en-GB`, so every erasure spec failed on a
 * disabled button and the confirmation gate looked broken. The phrase is a
 * translated string by design (five locales), so a spec that pins one language
 * is asserting the suite's locale, not the product.
 *
 * Reading it here does not weaken the gate: the near-miss case below proves a
 * WRONG word is refused, which is the property that matters.
 */
async function requiredPhrase(page: Page): Promise<string> {
  const phrase = page.getByRole('dialog').locator('[data-confirmation-phrase]');
  await expect(phrase).toBeVisible();
  return (await phrase.innerText()).trim();
}

test.describe('deactivating, which is the reversible one', () => {
  test('a deactivated participant leaves the active list and comes back', async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    const participant = await createParticipantWithData(page, 'Deactivate');

    await page.goto(`/participants/${participant.id}`);
    await page.getByRole('button', { name: /desactiva|deactivate|desactivar/i }).click();

    // Per the DATABASE, and polled: the screen reloads through the loader, so
    // asserting immediately would race the round trip rather than the feature.
    await expect
      .poll(() =>
        queryDatabase(`select is_active::text from public.profiles where id = '${participant.id}'`),
      )
      .toBe('false');

    // And back, because "reversible" is the entire reason this gesture exists
    // separately from the two below.
    await page.getByRole('button', { name: /activa|activate|activar/i }).click();
    await expect
      .poll(() =>
        queryDatabase(`select is_active::text from public.profiles where id = '${participant.id}'`),
      )
      .toBe('true');

    // Nothing was destroyed on the way: deactivation that quietly deleted rows
    // would look identical on this screen.
    expect(rowsAttachedTo(participant.id)).toBeGreaterThanOrEqual(5);
  });
});

test.describe('anonymizing', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  /** The gate is the point: a click alone must not be enough. */
  test('the confirm button stays disabled until the word is typed', async ({ page }) => {
    const participant = await createParticipantWithData(page, 'Gate');
    await page.goto(`/participants/${participant.id}`);
    await openConfirmDialog(page, /anonimitza|anonymize|anonimiza/i);

    const dialog = page.getByRole('dialog');
    const phrase = await requiredPhrase(page);
    const confirm = dialog.getByRole('button', { name: /anonimitza|anonymize|anonimiza/i });
    await expect(confirm).toBeDisabled();

    // A near miss must not open the gate, or "typed the word" would mean
    // "typed something". Derived from the real phrase so it stays a near miss
    // in every language.
    await dialog.getByRole('textbox').fill(phrase.slice(0, -2));
    await expect(confirm).toBeDisabled();

    await dialog.getByRole('textbox').fill(phrase);
    await expect(confirm).toBeEnabled();

    // And nothing happened while all that was being typed.
    expect(
      queryDatabase(
        `select coalesce(anonymized_at::text, 'null') from public.profiles where id = '${participant.id}'`,
      ),
    ).toBe('null');
  });

  test('anonymizing drops the person and keeps what a report counts', async ({ page }) => {
    const participant = await createParticipantWithData(page, 'Anonymize');
    queryDatabase(`
      update public.profiles
         set nationality = 'Síria', city = 'Vic', date_of_birth = '1994-06-15',
             phone = public.encrypt_field('600111222'), media_consent_at = now()
       where id = '${participant.id}';
    `);

    await page.goto(`/participants/${participant.id}`);
    await openConfirmDialog(page, /anonimitza|anonymize|anonimiza/i);
    await page
      .getByRole('dialog')
      .getByRole('textbox')
      .fill(await requiredPhrase(page));
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /anonimitza|anonymize|anonimiza/i })
      .click();

    // WAITED FOR FIRST. Everything below is an absence, and an absence assertion
    // on a page mid-navigation is satisfied by the page not having rendered.
    // This is the one line that makes the rest mean anything.
    await expect(
      page.getByText(/ja està anonimitzada|already anonymized|ya está anonimizada/i),
    ).toBeVisible({ timeout: 20_000 });

    const row = queryDatabase(`
      select
        coalesce(nullif(first_name, ''), 'EMPTY') || '|' ||
        coalesce(nationality, 'NULL') || '|' ||
        coalesce(city, 'NULL') || '|' ||
        coalesce(date_of_birth::text, 'NULL') || '|' ||
        coalesce(phone::text, 'NULL') || '|' ||
        coalesce(media_consent_at::text, 'NULL') || '|' ||
        is_active::text
      from public.profiles where id = '${participant.id}'
    `);
    const [firstName, nationality, city, dateOfBirth, phone, mediaConsent, isActive] =
      row.split('|');

    expect(firstName).toBe('EMPTY');
    expect(phone).toBe('NULL');
    expect(mediaConsent).toBe('NULL');
    expect(isActive).toBe('false');
    // The half that makes it anonymization rather than deletion.
    expect(nationality).toBe('Síria');
    expect(city).toBe('Vic');
    // Coarsened, not kept: an exact birth date beside a nationality and a town
    // identifies one woman.
    expect(dateOfBirth).toBe('1994-01-01');

    // The team's prose about her goes; no column-level anonymization reaches it.
    expect(
      countInDatabase(
        `select count(*) from public.participant_notes where profile_id = '${participant.id}'`,
      ),
    ).toBe(0);

    // She still counts, which is the whole justification for keeping the row.
    expect(
      countInDatabase(
        `select count(*) from public.profiles where nationality = 'Síria' and id = '${participant.id}'`,
      ),
    ).toBe(1);
  });
});

test.describe('erasing', () => {
  /**
   * THE ROLE BOUNDARY IN THE PRODUCT, not only in the policies. Staff run the
   * record; only an admin ends it. Asserted as what a staff member actually
   * SEES, because a control she can reach and that then refuses her is a
   * different (and worse) product than one that is not there.
   */
  test('a staff member is not offered erasure at all', async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    const participant = await createParticipantWithData(page, 'StaffView');

    await page.goto(`/participants/${participant.id}`);
    // PRESENT FIRST: the RGPD section is on screen, so the missing button below
    // means "not offered" rather than "not painted yet".
    await expect(
      page.getByRole('heading', { name: /dades personals|personal data|datos personales/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/només una administradora|only an admin|solo una administradora/i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /esborra-ho tot|erase everything|bórralo todo/i }),
    ).toHaveCount(0);

    expect(rowsAttachedTo(participant.id)).toBeGreaterThanOrEqual(5);
  });

  /**
   * THE ACCEPTANCE CRITERION OF THIS ISSUE. An admin erases a real participant
   * through the real screen, and afterwards nothing of hers is left anywhere,
   * per the database rather than per the screen.
   */
  test('an admin erases her, and nothing of hers survives', async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    const participant = await createParticipantWithData(page, 'Erase');
    const attachedBefore = rowsAttachedTo(participant.id);
    // The spec would be worthless against a participant who had nothing to
    // erase, and that is exactly how it would fail silently.
    expect(attachedBefore).toBeGreaterThanOrEqual(5);

    await signIn(page, ADMIN_EMAIL);
    await page.goto(`/participants/${participant.id}`);

    // Her own words, shown to the person about to act on them.
    await openConfirmDialog(page, /esborra-ho tot|erase everything|bórralo todo/i);
    await expect(page.getByRole('dialog')).toContainText(RUN_TAG);

    await page
      .getByRole('dialog')
      .getByRole('textbox')
      .fill(await requiredPhrase(page));
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /esborra-ho tot|erase everything|bórralo todo/i })
      .click();

    // PRESENT FIRST, and it is also the behaviour worth asserting: the erasure
    // sends her record's own page away, because the route's loader would now
    // find nothing.
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .toBe('/participants');

    expect(rowsAttachedTo(participant.id)).toBe(0);
    expect(
      countInDatabase(`select count(*) from auth.identities where user_id = '${participant.id}'`),
    ).toBe(0);
    expect(
      countInDatabase(`select count(*) from public.audit_log where actor_id = '${participant.id}'`),
    ).toBe(0);

    // The trail SURVIVES her, which is the decision ADR-023 records, and it is
    // asserted here rather than only in pgTAP because a future "tidy up the
    // audit log" change would break it through this path first.
    expect(
      countInDatabase(
        `select count(*) from public.audit_log
          where action = 'profile.delete' and target_id = '${participant.id}'`,
      ),
    ).toBe(1);
    expect(
      countInDatabase(
        `select count(*) from public.audit_log
          where action = 'profile.media_purged' and target_id = '${participant.id}'`,
      ),
    ).toBe(1);
  });

  /**
   * The back button after an erasure. A pushed history entry would take a staff
   * member straight back to a "not found" screen for a woman she just erased on
   * purpose, which reads as a bug in the erasure rather than as its consequence.
   */
  test('the back button does not lead to the record that was just erased', async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    const participant = await createParticipantWithData(page, 'Back');

    await signIn(page, ADMIN_EMAIL);
    await page.goto('/participants');
    await page.goto(`/participants/${participant.id}`);
    await openConfirmDialog(page, /esborra-ho tot|erase everything|bórralo todo/i);
    await page
      .getByRole('dialog')
      .getByRole('textbox')
      .fill(await requiredPhrase(page));
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /esborra-ho tot|erase everything|bórralo todo/i })
      .click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .toBe('/participants');

    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .not.toContain(participant.id);
  });
});

test.describe('the erasure-request queue', () => {
  test('a request she raised appears in the queue and links to her record', async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    const participant = await createParticipantWithData(page, 'Queue');

    await page.goto('/participants/deletion-requests');
    const row = page.locator('tr', { hasText: participant.id });
    await expect(row).toBeVisible({ timeout: 20_000 });
    // Her REASON, in her own words: the difference between "erase me" and "take
    // me off the photos" is decided by reading it.
    await expect(row).toContainText(RUN_TAG);

    await row.getByRole('link').click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toContain(participant.id);
  });
});

/**
 * THE MEDIA HALF, end to end, which is the acceptance criterion the rest of this
 * file cannot reach: everything above proves her ROWS are gone, and rows are not
 * where her photographs live.
 *
 * A real object is put in the bucket through the product's own upload path, as
 * HER, so the key is the one the app actually generates rather than one this
 * test invented. Then an admin erases her, and the receipt the Worker wrote is
 * asked how many objects it removed.
 *
 * The count is read from the audit trail rather than from the bucket because
 * that receipt is what Postgres itself checked before allowing the deletion: if
 * it says one object, one object was swept, and if the sweep had missed her
 * prefix it would say zero and this would be red.
 */
test('an object she uploaded is gone from storage after her erasure', async ({ page }) => {
  await signIn(page, STAFF_EMAIL);
  const participant = await createParticipantWithData(page, 'Media');

  // As her, with the credential the screen printed, exactly as she would.
  const herToken = await accessTokenFor(participant.email, participant.password);
  const uploaded = await uploadObjectAs(herToken, new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00]));
  // The key the APP generated carries her id and her organization; a sweep that
  // built a different prefix would not match it.
  expect(uploaded.objectKey).toContain(participant.id);

  await signIn(page, ADMIN_EMAIL);
  await page.goto(`/participants/${participant.id}`);
  await openConfirmDialog(page, /esborra-ho tot|erase everything|bórralo todo/i);
  await page
    .getByRole('dialog')
    .getByRole('textbox')
    .fill(await requiredPhrase(page));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /esborra-ho tot|erase everything|bórralo todo/i })
    .click();

  // PRESENT FIRST, before anything is asserted about what is gone.
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe('/participants');

  expect(
    queryDatabase(
      `select changes ->> 'objects_deleted' from public.audit_log
        where action = 'profile.media_purged' and target_id = '${participant.id}'`,
    ),
  ).toBe('1');
  expect(rowsAttachedTo(participant.id)).toBe(0);
});
