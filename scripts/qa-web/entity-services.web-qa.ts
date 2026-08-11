/**
 * Entity service submissions through the real browser and local Postgres.
 * Every expected state comes from the database, independently of the UI.
 */

import { expect, test, type Page } from '@playwright/test';
import {
  ENTITY_EMAIL,
  queryDatabase,
  SEED_PASSWORD,
  signIn,
  signOut,
  STAFF_EMAIL,
} from './session';

const PLAYER_EMAIL = 'amina.alhassan@example.test';
const ENTITY_USER_ID = '5eed0000-0000-4000-8000-000000000004';
const OTHER_ENTITY_USER_ID = '5eed0000-0000-4000-8000-000000000005';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const CATEGORY_ID = '5eed0000-0000-4000-8009-000000000001';
const PUBLISHED_ID = '43ed0000-0000-4000-800a-000000000001';
const REJECTED_ID = '43ed0000-0000-4000-800a-000000000002';
const DRAFT_ID = '43ed0000-0000-4000-800a-000000000003';
const OTHER_CONTACT_ID = '43ed0000-0000-4000-800a-000000000004';
const APPROVED_ID = '5eed0000-0000-4000-800a-000000000011';
const PUBLIC_COMMENT_ID = '43ed0000-0000-4000-800d-000000000001';
const INTERNAL_COMMENT_ID = '43ed0000-0000-4000-800d-000000000002';
const RUN_TAG = `rapp43${Date.now().toString(36)}`;
const PUBLIC_FIXTURE_BODY = `Comentari públic visible ${RUN_TAG}`;
const createdIds: string[] = [];

interface DatabaseField {
  readonly key: string;
  readonly type: 'select' | 'string-array' | 'boolean' | 'number' | 'text' | 'date';
  readonly required: boolean;
  readonly options?: readonly string[];
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function housingFields(): readonly DatabaseField[] {
  return JSON.parse(
    queryDatabase(
      `select metadata_schema->'fields' from public.service_categories where id = ${sqlLiteral(CATEGORY_ID)}`,
    ),
  ) as readonly DatabaseField[];
}

async function fillRequiredMetadata(page: Page) {
  for (const field of housingFields()) {
    const control = page.getByTestId(`service-metadata-${field.key}`);
    await expect(control).toBeVisible();
    if (!field.required) continue;
    if (field.type === 'select') await control.selectOption(field.options?.[0] ?? '');
    if (field.type === 'string-array') {
      await page.getByTestId(`service-metadata-${field.key}-${field.options?.[0] ?? ''}`).check();
    }
    if (field.type === 'number') await control.fill('2');
    if (field.type === 'text') await control.fill(`Àgora ${RUN_TAG}`);
    if (field.type === 'date') await control.fill('2026-12-15');
  }
}

function insertFixtures() {
  queryDatabase(
    `delete from public.services where id in (${[
      PUBLISHED_ID,
      REJECTED_ID,
      DRAFT_ID,
      OTHER_CONTACT_ID,
    ]
      .map(sqlLiteral)
      .join(',')});
     insert into public.services (
       id, org_id, category_id, title, description, provider_name, location, zone,
       cost_type, contact_name, contact_phone, contact_email, contact_role,
       availability, metadata, status, published_at, submitted_by, created_by,
       reviewed_by, reviewed_at, rejection_reason
     ) values
     (
       ${sqlLiteral(PUBLISHED_ID)}, ${sqlLiteral(ORG_ID)}, ${sqlLiteral(CATEGORY_ID)},
       '{"ca":"Servei publicat de prova","es":"Servicio publicado de prueba","en":"Published test service","ar":"خدمة اختبار منشورة","fa":"خدمت آزمایشی منتشرشده"}',
       '{"ca":"Descripció publicada","es":"Descripción publicada","en":"Published description","ar":"وصف منشور","fa":"توضیح منتشرشده"}',
       'Creu Roja Osona', 'Vic', 'Osona', 'free', 'Наталія Àlvarez', '+34930004301',
       'natalia.rapp43@example.test', 'Coordinació', 'available',
       '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"women_only"}',
       'published', now() - interval '2 days', ${sqlLiteral(ENTITY_USER_ID)}, ${sqlLiteral(ENTITY_USER_ID)},
       '5eed0000-0000-4000-8000-000000000002', now() - interval '2 days', null
     ),
     (
       ${sqlLiteral(REJECTED_ID)}, ${sqlLiteral(ORG_ID)}, ${sqlLiteral(CATEGORY_ID)},
       '{"ca":"Proposta rebutjada de prova"}', '{"ca":"Cal corregir-la"}',
       'Creu Roja Osona', 'Vic', 'Osona', 'free', 'Sílvia Bosch', '+34938850000',
       'silvia.bosch@example.test', 'Tècnica social', 'available',
       '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"women_only"}',
       'rejected', null, ${sqlLiteral(ENTITY_USER_ID)}, ${sqlLiteral(ENTITY_USER_ID)},
       '5eed0000-0000-4000-8000-000000000002', now() - interval '1 day', 'Falta confirmar la data'
     ),
     (
       ${sqlLiteral(DRAFT_ID)}, ${sqlLiteral(ORG_ID)}, ${sqlLiteral(CATEGORY_ID)},
       '{"ca":"Esborrany eliminable de prova"}', '{"ca":"Es pot eliminar"}',
       'Creu Roja Osona', 'Vic', 'Osona', 'free', 'Sílvia Bosch', '+34938850000',
       'silvia.bosch@example.test', 'Tècnica social', 'available',
       '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"women_only"}',
       'draft', null, ${sqlLiteral(ENTITY_USER_ID)}, ${sqlLiteral(ENTITY_USER_ID)}, null, null, null
     ),
     (
       ${sqlLiteral(OTHER_CONTACT_ID)}, ${sqlLiteral(ORG_ID)}, ${sqlLiteral(CATEGORY_ID)},
       '{"ca":"Servei d''una altra entitat"}', '{"ca":"No ha de ser visible"}',
       'CEAR Catalunya', 'Barcelona', 'Barcelona', 'free', 'Секретний Контакт', '+34930004399',
       'secret.rapp43@example.test', 'Privat', 'available',
       '{"housing_type":"room","duration":"temporary","deposit_required":false,"for_whom":"women_only"}',
       'pending', null, ${sqlLiteral(OTHER_ENTITY_USER_ID)}, ${sqlLiteral(OTHER_ENTITY_USER_ID)}, null, null, null
     );
     insert into public.service_submission_comments (
       id, org_id, service_id, author_id, author_role, body, is_internal
     ) values
       (${sqlLiteral(PUBLIC_COMMENT_ID)}, ${sqlLiteral(ORG_ID)}, ${sqlLiteral(APPROVED_ID)},
        ${sqlLiteral(ENTITY_USER_ID)}, 'entity', ${sqlLiteral(PUBLIC_FIXTURE_BODY)}, false),
       (${sqlLiteral(INTERNAL_COMMENT_ID)}, ${sqlLiteral(ORG_ID)}, ${sqlLiteral(APPROVED_ID)},
        '5eed0000-0000-4000-8000-000000000002', 'staff',
        'Confirmar la data amb coordinació abans de respondre.', true)
     on conflict (id) do nothing;`,
  );
}

test.describe.serial('entity service submission product flow', () => {
  test.beforeAll(() => insertFixtures());

  test.afterAll(() => {
    queryDatabase(
      `delete from public.service_submission_comments where id in (${sqlLiteral(PUBLIC_COMMENT_ID)}, ${sqlLiteral(INTERNAL_COMMENT_ID)})`,
    );
    queryDatabase(
      `delete from public.services where id in (${[
        PUBLISHED_ID,
        REJECTED_ID,
        DRAFT_ID,
        OTHER_CONTACT_ID,
        ...createdIds,
      ]
        .map(sqlLiteral)
        .join(',')})`,
    );
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ENTITY_EMAIL);
  });

  test('creates a pending scheduled submission with scoped contact reuse and database-backed dynamic fields', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/portal/services');
    const expectedOwnCount = Number(
      queryDatabase(
        `select count(*) from public.services where submitted_by = ${sqlLiteral(ENTITY_USER_ID)}`,
      ),
    );
    await expect(page.getByTestId('entity-service-list').locator('> li')).toHaveCount(
      expectedOwnCount,
    );
    await expect(page.getByText("Servei d'una altra entitat")).toHaveCount(0);

    await page.getByTestId('entity-service-new').click();
    await page.getByTestId('service-category').selectOption(CATEGORY_ID);
    await expect(page.getByTestId(/^service-metadata-field-/)).toHaveCount(housingFields().length);

    const contactInput = page.getByTestId('service-contact-name');
    await contactInput.fill('Нат');
    await expect(page.getByTestId('entity-service-contact-option-0')).toContainText('Наталія');
    await contactInput.fill('Alv');
    await expect(page.getByTestId('entity-service-contact-option-0')).toContainText('Àlvarez');
    await expect(page.getByText('Секретний Контакт')).toHaveCount(0);
    await contactInput.fill('cap-resultat-zzzz');
    await expect(page.getByTestId('entity-service-contact-results').locator('button')).toHaveCount(
      0,
    );
    await contactInput.fill('Нат');
    await page.getByTestId('entity-service-contact-option-0').click();
    await expect(contactInput).toHaveValue('Наталія Àlvarez');
    await expect(page.getByTestId('entity-service-contact-results')).toHaveCount(0);

    const title = `<img src=x onerror=alert(1)> Servei Àgora ${RUN_TAG}`;
    const description = `Suport per a أمينة i Наталія ${RUN_TAG}`;
    const future = new Date(Date.now() + 8 * 24 * 60 * 60 * 1_000);
    const expiry = new Date(Date.now() + 16 * 24 * 60 * 60 * 1_000);
    await page.getByTestId('entity-service-title').fill(title.slice(0, 17));
    await expect(page.getByTestId('entity-service-title')).toHaveValue(title.slice(0, 17));
    await page.getByTestId('entity-service-title').fill(title);
    await page.getByTestId('entity-service-description').fill(description);
    await fillRequiredMetadata(page);
    await page.getByTestId('entity-service-published-at').fill(future.toISOString().slice(0, 16));
    await page.getByTestId('entity-service-expires-at').fill(expiry.toISOString().slice(0, 16));
    await page.getByTestId('entity-service-save').click();
    await expect(page).toHaveURL(/\/portal\/services\/[0-9a-f-]+$/, { timeout: 30_000 });

    const id = queryDatabase(
      `select id from public.services where title->>'ca' = ${sqlLiteral(title)} order by created_at desc limit 1`,
    );
    expect(id).not.toBe('');
    createdIds.push(id);
    expect(
      queryDatabase(
        `select status || '|' || (published_at > now())::text || '|' || contact_name || '|' || (description->>'ca') from public.services where id = ${sqlLiteral(id)}`,
      ),
    ).toBe(`pending|true|Наталія Àlvarez|${description}`);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);

    await page.reload();
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole('link', { name: /torna als serveis|back to services/i }).click();
    await expect(page.getByText(title)).toBeVisible();
    await page.goBack();
    await expect(page.getByText(title)).toBeVisible();
  });

  test('keeps internal staff notes hidden and persists a hostile multilingual entity comment', async ({
    page,
  }) => {
    await page.goto(`/portal/services/${APPROVED_ID}`);
    expect(
      Number(
        queryDatabase(
          `select count(*) from public.service_submission_comments where service_id = ${sqlLiteral(APPROVED_ID)} and is_internal`,
        ),
      ),
    ).toBeGreaterThan(0);
    await expect(page.getByText(PUBLIC_FIXTURE_BODY)).toBeVisible();
    await expect(
      page.getByText('Confirmar la data amb coordinació abans de respondre.'),
    ).toHaveCount(0);

    const comment = `<script>alert(43)</script> Gràcies أمينة Наталія ${RUN_TAG}`;
    await page.getByTestId('entity-service-comment-body').fill(comment);
    await page.getByTestId('entity-service-comment-send').click();
    await expect(page.getByText(comment)).toBeVisible();
    await expect(page.getByTestId('entity-service-comments').locator('script')).toHaveCount(0);
    expect(
      queryDatabase(
        `select body || '|' || is_internal::text || '|' || author_role from public.service_submission_comments where service_id = ${sqlLiteral(APPROVED_ID)} and body = ${sqlLiteral(comment)}`,
      ),
    ).toBe(`${comment}|false|entity`);
    await page.reload();
    await expect(page.getByText(comment)).toBeVisible();
    await expect(
      page.getByText('Confirmar la data amb coordinació abans de respondre.'),
    ).toHaveCount(0);
  });

  test('edits a published service live, preserves translations, and creates a staff notification', async ({
    page,
  }) => {
    await page.goto(`/portal/services/${PUBLISHED_ID}`);
    const notificationCountBefore = Number(
      queryDatabase(
        `select count(*) from public.service_submission_notifications where service_id = ${sqlLiteral(PUBLISHED_ID)}`,
      ),
    );
    const editedTitle = `<b>Publicat Àgora ${RUN_TAG}</b>`;
    await page.getByTestId('entity-service-title').fill(editedTitle);
    await page.getByTestId('entity-service-save').click();
    await expect
      .poll(() =>
        queryDatabase(
          `select title->>'ca' from public.services where id = ${sqlLiteral(PUBLISHED_ID)}`,
        ),
      )
      .toBe(editedTitle);
    await expect(page.getByTestId('entity-service-title')).toHaveValue(editedTitle);
    expect(
      queryDatabase(
        `select status || '|' || (published_at between now() - interval '30 seconds' and now())::text || '|' || (select count(*) from jsonb_object_keys(title)) from public.services where id = ${sqlLiteral(PUBLISHED_ID)}`,
      ),
    ).toBe('published|true|5');
    expect(
      Number(
        queryDatabase(
          `select count(*) from public.service_submission_notifications where service_id = ${sqlLiteral(PUBLISHED_ID)}`,
        ),
      ),
    ).toBe(notificationCountBefore + 1);
    await expect(page.locator('main b')).toHaveCount(0);
  });

  test('resubmits a rejected service and deletes a draft through the dashboard', async ({
    page,
  }) => {
    await page.goto('/portal/services');
    await page.getByTestId(`entity-service-resubmit-${REJECTED_ID}`).click();
    await expect
      .poll(() =>
        queryDatabase(`select status from public.services where id = ${sqlLiteral(REJECTED_ID)}`),
      )
      .toBe('pending');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId(`entity-service-delete-${DRAFT_ID}`).click();
    await expect(page.getByTestId(`entity-service-row-${DRAFT_ID}`)).toHaveCount(0);
    expect(
      queryDatabase(`select count(*) from public.services where id = ${sqlLiteral(DRAFT_ID)}`),
    ).toBe('0');
  });
});

test.describe('entity service product role boundaries', () => {
  test('staff is redirected away from the entity service portal', async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
    await page.goto('/portal/services');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('entity-service-new')).toHaveCount(0);
  });

  test('a player sees the terminal no-access product state', async ({ page }) => {
    await signOut(page);
    await page.goto('/login');
    const usePassword = page.getByRole('button', { name: /contrasenya|password/i }).first();
    await expect(usePassword).toBeVisible();
    await expect(async () => {
      await usePassword.click();
      await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await page.locator('input[type="email"]').fill(PLAYER_EMAIL);
    await page.locator('input[type="password"]').fill(SEED_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByRole('button', { name: /tanca la sessió|log out/i })).toBeVisible();
    await page.goto('/portal/services');
    await expect(page.getByTestId('entity-service-new')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /tanca la sessió|sign out|log out/i }),
    ).toBeVisible();
  });
});
