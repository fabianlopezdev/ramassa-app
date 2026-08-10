/**
 * The participant detail view, driven the way a staff member drives it
 * (RAPP-24).
 *
 * The assertion this file exists for is the AUDIT one: opening a participant's
 * record decrypts her document number, phone and address, and the database must
 * carry a row saying who looked and when. pgTAP proves the RPC does that when
 * called directly; this proves the SCREEN calls it, because RAPP-23 shipped a
 * search whose pgTAP assertion passed along a route the app never takes. An
 * unaudited access has exactly the same failure shape: everything looks right
 * on screen, and the one record that had to exist does not.
 *
 * So every expected value here comes from psql and every action goes through
 * the product: a real login, a real click on a name in the roster, real typing
 * into the real note box.
 *
 * The specs are written to be RE-RUNNABLE against a database earlier runs have
 * already changed. Nothing asserts an absolute ("her town is Vic"); everything
 * asserts a relationship ("her town is now what I typed", "there is one more
 * audit row than before"). A suite that only passes on a freshly reset database
 * gets reset-before-run habits, and those hide state bugs.
 */

import { expect, test, type Page } from '@playwright/test';
import { countInDatabase, ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

/**
 * The subject, looked up by NAME rather than by a hardcoded seed id. The seeds
 * derive ids from an ordinal, so a literal here would be a third copy of that
 * derivation, silently wrong the day the roster changes.
 */
function participantIdByLastName(lastName: string): string {
  const id = queryDatabase(
    `select id from public.profiles where role = 'player' and last_name = '${lastName}' limit 1`,
  );
  expect(id, `no seeded participant named ${lastName}`).not.toBe('');
  return id;
}

function accessAuditCount(participantId: string): number {
  return countInDatabase(
    `select count(*) from public.audit_log
      where action = 'profile.view_sensitive' and target_id = '${participantId}'`,
  );
}

function noteCount(participantId: string): number {
  return countInDatabase(
    `select count(*) from public.participant_notes where profile_id = '${participantId}'`,
  );
}

async function openDetail(page: Page, participantId: string): Promise<void> {
  await page.goto(`/participants/${participantId}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test.describe('the participant detail view', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  /**
   * The navigation this issue adds. Driven by CLICKING a name in the roster
   * rather than by typing the URL, because the row link is the thing that did
   * not exist before and a `page.goto` would pass with no link on the page at
   * all.
   */
  test('a name in the roster opens that participant record', async ({ page }) => {
    await page.goto('/participants?q=quispe');
    const nameLink = page.getByRole('link', { name: /Quispe/ });
    await expect(nameLink).toBeVisible();
    await nameLink.click();

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
      .toMatch(/^\/participants\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1, name: /Quispe/ })).toBeVisible();
  });

  /**
   * THE ONE THIS ISSUE EXISTS FOR.
   *
   * Counted before and after, rather than asserted as a total: the seeds carry
   * audit rows of their own and earlier specs add more, so an absolute number
   * would be a number that rots. The relationship is the promise: one look,
   * one row.
   */
  test('opening a record writes an access-audit row naming who looked', async ({ page }) => {
    const participantId = participantIdByLastName('Mamani');
    const before = accessAuditCount(participantId);

    await openDetail(page, participantId);
    // The decrypted block is on screen, so the read really happened.
    await expect(page.getByText(/Y00000\d\dZ/)).toBeVisible();

    await expect.poll(() => accessAuditCount(participantId), { timeout: 10_000 }).toBe(before + 1);

    const actorEmail = queryDatabase(
      `select u.email from public.audit_log a
         join auth.users u on u.id = a.actor_id
        where a.action = 'profile.view_sensitive' and a.target_id = '${participantId}'
        order by a.created_at desc limit 1`,
    );
    expect(actorEmail).toBe(STAFF_EMAIL);
  });

  /**
   * A record that was never read must not look like one that was. This is the
   * half of the audit that a "log everything defensively" implementation gets
   * wrong, and it is the half that makes the log worth reading.
   */
  test('a record that does not exist is an empty state, and audits nothing', async ({ page }) => {
    const missingId = '00000000-0000-4000-8000-00000000dead';
    const auditRowsBefore = countInDatabase('select count(*) from public.audit_log');

    await page.goto(`/participants/${missingId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /llista|list/i })).toBeVisible();

    expect(countInDatabase('select count(*) from public.audit_log')).toBe(auditRowsBefore);
  });

  /**
   * The decrypted fields on screen are the ones the database actually holds.
   *
   * The subject is chosen by a PREDICATE rather than by name: several seeded
   * participants genuinely hold no identity document (the just-arrived case),
   * and picking one of those would assert that an empty string is visible,
   * which it always is.
   */
  test('the sensitive fields on screen match what the database holds', async ({ page }) => {
    const participantId = queryDatabase(
      `select id from public.profiles
        where role = 'player' and document_number is not null
        order by last_name limit 1`,
    );
    expect(participantId).not.toBe('');
    const phone = queryDatabase(
      `select public.decrypt_field(phone) from public.profiles where id = '${participantId}'`,
    );
    const documentNumber = queryDatabase(
      `select public.decrypt_field(document_number) from public.profiles where id = '${participantId}'`,
    );
    expect(phone).not.toBe('');
    expect(documentNumber).not.toBe('');

    await openDetail(page, participantId);

    await expect(page.getByText(phone, { exact: true })).toBeVisible();
    await expect(page.getByText(documentNumber, { exact: true })).toBeVisible();
    // The screen says the look was logged, rather than logging it silently.
    await expect(page.getByText(/registrada|logged|registrado/i)).toBeVisible();
  });

  /**
   * Editing, through the product: open the form, change a field, save, and ask
   * the DATABASE what happened. The town is flipped between two values so the
   * spec is re-runnable, and read back from psql rather than from the screen
   * that just claimed to have saved it.
   */
  test('an edited field reaches the database, and the roster shows it', async ({ page }) => {
    const participantId = participantIdByLastName('Ortega');
    const before = queryDatabase(`select city from public.profiles where id = '${participantId}'`);
    // Two Osona towns that share no word with any other seeded town. That is
    // not fussiness: the roster spec asserts that searching "Torelló" finds
    // exactly the participants whose town IS Torelló, and a value like "Sant
    // Pere de Torelló" written here would satisfy the full-text search while
    // failing the equality count, breaking a passing spec in another file.
    const nextCity = before === 'Gurb' ? 'Calldetenes' : 'Gurb';

    await openDetail(page, participantId);
    await page.getByRole('button', { name: /edita|edit/i }).click();

    const cityField = page.locator('#participant-city');
    await expect(cityField).toBeVisible();
    await cityField.fill(nextCity);
    await page.getByRole('button', { name: /desa|save|guarda/i }).click();

    await expect
      .poll(() => queryDatabase(`select city from public.profiles where id = '${participantId}'`), {
        timeout: 15_000,
      })
      .toBe(nextCity);

    // "Reflected in the table" is an acceptance criterion, so it is asserted in
    // the table rather than inferred from the detail view having re-rendered.
    await page.goto(`/participants?q=${encodeURIComponent(nextCity)}`);
    await expect(page.getByRole('link', { name: /Ortega/ })).toBeVisible();
  });

  /**
   * An accented town has to survive the round trip. It is the same class of bug
   * RAPP-23 shipped, one layer down: a value that looks fine on the way in and
   * comes back folded.
   */
  test('a value typed with its accents comes back with them', async ({ page }) => {
    const participantId = participantIdByLastName('Ribes');

    await openDetail(page, participantId);
    await page.getByRole('button', { name: /edita|edit/i }).click();
    await page.locator('#participant-placeOfBirth').fill('Sant Julià de Vilatorta');
    await page.getByRole('button', { name: /desa|save|guarda/i }).click();

    await expect
      .poll(
        () =>
          queryDatabase(`select place_of_birth from public.profiles where id = '${participantId}'`),
        { timeout: 15_000 },
      )
      .toBe('Sant Julià de Vilatorta');
  });

  /**
   * The validation the schema and the column agree on, met the way a person
   * meets it: pressing Add on an empty box. The screen has to SAY something;
   * a button that does nothing is how a working form reads as a broken app.
   */
  test('an empty note is refused with words, not silence', async ({ page }) => {
    const participantId = participantIdByLastName('Mamani');
    const before = noteCount(participantId);

    await openDetail(page, participantId);
    await page.getByRole('button', { name: /afegeix la nota|add the note|añade la nota/i }).click();

    await expect(page.getByText(/escriu alguna cosa|write something|escribe algo/i)).toBeVisible();
    expect(noteCount(participantId)).toBe(before);
  });

  test('a note typed in the box is stored, signed and shown', async ({ page }) => {
    const participantId = participantIdByLastName('Diallo');
    const before = noteCount(participantId);
    // Accents and Arabic in one note: this is a team that writes both.
    const body = `Ha trucat aquest matí, تحدثنا معها (${before + 1})`;

    await openDetail(page, participantId);
    // Located by its own id, not by an accessible name matching /note/i. The
    // equipment section (RAPP-27) added a "Notes" field of its own to this same
    // screen, and the name match then resolved to two controls and failed in
    // strict mode. An id is what distinguishes the staff note thread from
    // anything else on the page that is also, reasonably, called a note.
    await page.locator('#participant-note').fill(body);
    await page.getByRole('button', { name: /afegeix la nota|add the note|añade la nota/i }).click();

    await expect.poll(() => noteCount(participantId), { timeout: 15_000 }).toBe(before + 1);

    // Signed by the staff member who typed it, per the database, not per the
    // name the screen chose to render.
    const author = queryDatabase(
      `select u.email from public.participant_notes n
         join auth.users u on u.id = n.author_id
        where n.profile_id = '${participantId}' order by n.created_at desc limit 1`,
    );
    expect(author).toBe(STAFF_EMAIL);

    // Scoped to the note that carries THIS body, not to the page: after a few
    // runs the thread holds several notes by the same author, and an unscoped
    // match would either be ambiguous or, worse, be satisfied by somebody
    // else's signature.
    const addedNote = page.locator('li', { hasText: body });
    await expect(addedNote).toBeVisible();
    await expect(addedNote.getByText(/Marta Puig/)).toBeVisible();
    // The promise the screen makes about what notes are.
    await expect(
      page.getByText(/no es poden editar|cannot be edited|no se pueden editar/i),
    ).toBeVisible();
  });

  test('a service interest appears in the participant timeline', async ({ page }) => {
    const participantId = participantIdByLastName('Mamani');
    const serviceId = queryDatabase(
      `select id from public.services where status = 'published' and published_at <= now() and (expires_at is null or expires_at > now()) order by updated_at desc, id limit 1`,
    );
    expect(serviceId).not.toBe('');
    const existed =
      queryDatabase(
        `select exists(select 1 from public.service_interests where service_id = '${serviceId}' and user_id = '${participantId}')::text`,
      ) === 't';

    try {
      queryDatabase(
        `insert into public.service_interests (org_id, service_id, user_id)
         select org_id, id, '${participantId}' from public.services where id = '${serviceId}'
         on conflict (service_id, user_id) do nothing`,
      );
      const interestId = queryDatabase(
        `select id from public.service_interests where service_id = '${serviceId}' and user_id = '${participantId}'`,
      );
      const title = queryDatabase(
        `select title->>'ca' from public.services where id = '${serviceId}'`,
      );

      await openDetail(page, participantId);
      const entry = page.getByTestId(`participant-activity-service_interest-${interestId}`);
      await expect(entry).toBeVisible();
      await expect(entry).toContainText(title);
    } finally {
      if (!existed) {
        queryDatabase(
          `delete from public.service_interests where service_id = '${serviceId}' and user_id = '${participantId}'`,
        );
      }
    }
  });

  test('the status toggle flips the record, and the roster filter agrees', async ({ page }) => {
    const participantId = participantIdByLastName('Camara');
    const wasActive =
      queryDatabase(`select is_active from public.profiles where id = '${participantId}'`) === 't';

    await openDetail(page, participantId);
    await page.getByRole('button', { name: /desactiva|reactiva|deactivate|reactivate/i }).click();

    await expect
      .poll(
        () => queryDatabase(`select is_active from public.profiles where id = '${participantId}'`),
        { timeout: 15_000 },
      )
      .toBe(wasActive ? 'f' : 't');

    // The status change is audited under its own action, not buried in an edit.
    expect(
      countInDatabase(
        `select count(*) from public.audit_log
          where target_id = '${participantId}'
            and action = '${wasActive ? 'profile.deactivate' : 'profile.activate'}'`,
      ),
    ).toBeGreaterThan(0);

    await page.goto(`/participants?status=${wasActive ? 'inactive' : 'active'}`);
    await expect(page.getByRole('link', { name: /Camara/ })).toBeVisible();
  });

  /**
   * The URL is the state model of the roster, and the detail view has to live
   * inside that rather than break out of it: a staff member filters, opens
   * someone, and comes back to the list she left.
   */
  test('the record survives a reload, and back returns to the filtered roster', async ({
    page,
  }) => {
    await page.goto('/participants?q=quispe');
    await page.getByRole('link', { name: /Quispe/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Quispe/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: /Quispe/ })).toBeVisible();

    await page.goBack();
    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('q=quispe');
  });
});

/**
 * The role boundary in the PRODUCT, not only in the policies.
 *
 * An entity contact who is handed a link to a participant's record must not
 * reach the screen at all. RLS is the second line and pgTAP asserts it: even if
 * routing let her through, the RPC returns nothing and writes no audit row.
 */
test('an entity contact is routed away from a participant record', async ({ page }) => {
  const participantId = queryDatabase(
    `select id from public.profiles where role = 'player' and last_name = 'Mamani' limit 1`,
  );
  const auditRowsBefore = countInDatabase('select count(*) from public.audit_log');

  await signIn(page, ENTITY_EMAIL);
  await page.goto(`/participants/${participantId}`);

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
    .not.toContain('/participants/');
  await expect(page.getByText(/Y00000\d\dZ/)).toHaveCount(0);

  // And her failed attempt did not file an access she never made.
  expect(countInDatabase('select count(*) from public.audit_log')).toBe(auditRowsBefore);
});
