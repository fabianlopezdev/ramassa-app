/**
 * The entity's Services tab in the app (RAPP-414), through the web build: her
 * own submissions only, the form's check, a contact she used before filled in
 * one tap, a submission sent for review with a comment to the team, and the
 * actions a status allows (resubmit a rejected one, delete a draft, correct
 * a rejected one, which sends it for review again). Expected values come from
 * the database.
 */
import { expect, test, type Page } from '@playwright/test';
import { completeSecondFactor, ENTITY_EMAIL, queryDatabase, signInPlayer } from './session';

test.setTimeout(240_000);

const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const ENTITY_USER_ID = '5eed0000-0000-4000-8000-000000000004';
const OTHER_ENTITY_USER_ID = '5eed0000-0000-4000-8000-000000000005';
const STAFF_USER_ID = '5eed0000-0000-4000-8000-000000000002';
const HOUSING_ID = '5eed0000-0000-4000-8009-000000000001';
const REJECTED_ID = '41ed0000-0000-4000-800a-000000000001';
const DRAFT_ID = '41ed0000-0000-4000-800a-000000000002';
const OTHER_ID = '41ed0000-0000-4000-800a-000000000003';
const EDIT_ID = '41ed0000-0000-4000-800a-000000000004';
const tag = Date.now().toString(36);
const CONTACT = `Núria Contacte ${tag}`;
const NEW_TITLE = `Habitació a Manlleu ${tag}`;
const EDITED_TITLE = `Proposta corregida ${tag}`;
const COMMENT = `Podem començar el dilluns ${tag}`;
const FIXTURE_IDS = [REJECTED_ID, DRAFT_ID, OTHER_ID, EDIT_ID];

const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
const HOUSING_METADATA =
  '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"women_only"}';

function fixture(id: string, title: string, status: string, owner: string, extra = 'null') {
  return `(${sql(id)}, ${sql(ORG_ID)}, ${sql(HOUSING_ID)}, ${sql(JSON.stringify({ ca: title }))},
    '{"ca":"Descripció de prova"}', 'Creu Roja Osona', 'Vic', 'Osona', 'free', ${sql(CONTACT)},
    '+34930001111', 'nuria-${tag}@example.test', 'Coordinació', 'available', '${HOUSING_METADATA}',
    ${sql(status)}, ${sql(owner)}, ${sql(owner)},
    ${status === 'rejected' ? sql(STAFF_USER_ID) : 'null'},
    ${status === 'rejected' ? 'now()' : 'null'}, ${extra})`;
}

test.beforeAll(() => {
  queryDatabase(`
    delete from public.services where id in (${FIXTURE_IDS.map(sql).join(',')});
    insert into public.services (
      id, org_id, category_id, title, description, provider_name, location, zone, cost_type,
      contact_name, contact_phone, contact_email, contact_role, availability, metadata, status,
      submitted_by, created_by, reviewed_by, reviewed_at, rejection_reason
    ) values
      ${fixture(REJECTED_ID, `Proposta rebutjada ${tag}`, 'rejected', ENTITY_USER_ID, "'Falta la data'")},
      ${fixture(EDIT_ID, `Proposta per corregir ${tag}`, 'rejected', ENTITY_USER_ID, "'Cal el telèfon'")},
      ${fixture(DRAFT_ID, `Esborrany ${tag}`, 'draft', ENTITY_USER_ID)},
      ${fixture(OTHER_ID, `Servei d'una altra entitat ${tag}`, 'pending', OTHER_ENTITY_USER_ID)};
  `);
});

test.afterAll(() => {
  queryDatabase(`
    begin;
    create temporary table qa_services on commit drop as
      select id from public.services
       where id in (${FIXTURE_IDS.map(sql).join(',')}) or title->>'ca' = ${sql(NEW_TITLE)};
    delete from public.service_submission_notifications where service_id in (select id from qa_services);
    delete from public.service_submission_comments where service_id in (select id from qa_services);
    delete from public.services where id in (select id from qa_services);
    commit;
  `);
});

async function openServices(page: Page): Promise<void> {
  await signInPlayer(page, ENTITY_EMAIL);
  await completeSecondFactor(page, ENTITY_EMAIL);
  await page.getByTestId('entity-sidebar-services').click({ timeout: 30_000 });
  await expect(page.getByTestId('entity-services')).toBeVisible({ timeout: 30_000 });
}

test('her own submissions, the form check, contact reuse, a sent one and a comment', async ({
  page,
}) => {
  await openServices(page);
  const own = queryDatabase(`
    select string_agg(id::text, ',') from public.services where submitted_by = ${sql(ENTITY_USER_ID)};
  `)
    .trim()
    .split(',');
  for (const id of own) {
    await expect(page.getByTestId(`entity-service-row-${id}`)).toBeVisible({ timeout: 30_000 });
  }
  await expect(page.getByTestId(`entity-service-row-${OTHER_ID}`)).toHaveCount(0);

  await page.getByTestId('entity-service-new').click();
  await page.getByTestId('entity-service-category-housing').click({ timeout: 30_000 });
  await page.getByTestId('entity-service-save').click();
  await expect(page.getByTestId('entity-service-form-error')).toBeVisible();

  await page.getByTestId('entity-service-title').fill(NEW_TITLE);
  await page.getByTestId('entity-service-description').fill('Una habitació per a una dona sola.');
  await page.getByTestId('entity-service-contactName').fill(`nuria contacte ${tag}`);
  await page.getByTestId('entity-service-contact-option-0').click();
  await expect(page.getByTestId('entity-service-contactName')).toHaveValue(CONTACT);
  await expect(page.getByTestId('entity-service-contactEmail')).toHaveValue(
    `nuria-${tag}@example.test`,
  );
  await expect(page.getByTestId('entity-service-contact-results')).toHaveCount(0);
  await page.getByTestId('service-metadata-housing_type-room').click();
  await page.getByTestId('service-metadata-duration-temporary').click();
  await page.getByTestId('service-metadata-for_whom-women_only').click();
  await page.getByTestId('entity-service-save').click();

  await expect(page.getByTestId('entity-service-readonly')).toBeVisible({ timeout: 30_000 });
  const created = queryDatabase(`
    select id || '|' || status || '|' || submitted_by || '|' || contact_email || '|' ||
           (metadata->>'housing_type')
      from public.services where title->>'ca' = ${sql(NEW_TITLE)};
  `)
    .trim()
    .split('|');
  expect(created.slice(1)).toEqual([
    'pending',
    ENTITY_USER_ID,
    `nuria-${tag}@example.test`,
    'room',
  ]);

  await page.getByTestId('entity-service-comment-body').fill(COMMENT);
  await page.getByTestId('entity-service-comment-send').click();
  await expect(page.getByText(COMMENT)).toBeVisible({ timeout: 30_000 });
  expect(
    queryDatabase(`
      select author_role || '|' || is_internal from public.service_submission_comments
       where service_id = '${created[0]}' and body = ${sql(COMMENT)};
    `).trim(),
  ).toBe('entity|false');
});

test('a draft is deleted, a rejected one resubmitted, and another corrected', async ({ page }) => {
  await openServices(page);
  page.on('dialog', (dialog) => void dialog.accept());

  await page.getByTestId(`entity-service-delete-${DRAFT_ID}`).click({ timeout: 30_000 });
  await expect(page.getByTestId(`entity-service-row-${DRAFT_ID}`)).toHaveCount(0, {
    timeout: 30_000,
  });
  expect(
    queryDatabase(`select count(*) from public.services where id = '${DRAFT_ID}';`).trim(),
  ).toBe('0');

  await page.getByTestId(`entity-service-resubmit-${REJECTED_ID}`).click();
  await expect
    .poll(
      () => queryDatabase(`select status from public.services where id = '${REJECTED_ID}';`).trim(),
      { timeout: 30_000 },
    )
    .toBe('pending');
  await expect(page.getByTestId(`entity-service-resubmit-${REJECTED_ID}`)).toHaveCount(0);

  await page.getByTestId(`entity-service-open-${EDIT_ID}`).click();
  await expect(page.getByText('Cal el telèfon')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('entity-service-title').fill(EDITED_TITLE);
  await page.getByTestId('entity-service-save').click();
  await expect(page.getByTestId('entity-service-readonly')).toBeVisible({ timeout: 30_000 });
  expect(
    queryDatabase(`
      select title->>'ca' || '|' || status || '|' || coalesce(rejection_reason, 'none')
        from public.services where id = '${EDIT_ID}';
    `).trim(),
  ).toBe(`${EDITED_TITLE}|pending|none`);
});
