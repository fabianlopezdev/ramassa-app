/**
 * RAPP-44: two authenticated browser sessions prove the complete entity to
 * staff to published loop. Every expected durable value is read independently
 * from Postgres rather than copied from the UI under test.
 */

import { expect, test, type Page } from '@playwright/test';
import { ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

const CATEGORY_ID = '5eed0000-0000-4000-8009-000000000001';
const ORG_ID = '5eed0000-0000-4000-8000-000000000000';
const RUN_TAG = `rapp44${Date.now().toString(36)}`;
const createdServiceIds: string[] = [];

interface DatabaseField {
  readonly key: string;
  readonly type: 'select' | 'string-array' | 'boolean' | 'number' | 'text' | 'date';
  readonly required: boolean;
  readonly options?: readonly string[];
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function requiredFields(): readonly DatabaseField[] {
  return JSON.parse(
    queryDatabase(
      `select metadata_schema->'fields' from public.service_categories where id = ${sqlLiteral(CATEGORY_ID)}`,
    ),
  ) as readonly DatabaseField[];
}

async function fillRequiredMetadata(page: Page) {
  for (const field of requiredFields()) {
    if (!field.required) continue;
    const control = page.getByTestId(`service-metadata-${field.key}`);
    if (field.type === 'select') await control.selectOption(field.options?.[0] ?? '');
    if (field.type === 'string-array') {
      await page.getByTestId(`service-metadata-${field.key}-${field.options?.[0] ?? ''}`).check();
    }
    if (field.type === 'boolean') await control.check();
    if (field.type === 'number') await control.fill('2');
    if (field.type === 'text') await control.fill(`Àgora ${RUN_TAG}`);
    if (field.type === 'date') await control.fill('2026-12-15');
  }
}

async function submitService(
  page: Page,
  values: { readonly title: string; readonly description: string; readonly provider: string },
): Promise<string> {
  await page.goto('/portal/services/new');
  await expect(page.getByTestId('entity-service-title')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('service-category').selectOption(CATEGORY_ID);
  await page.getByTestId('entity-service-title').fill(values.title.slice(0, 16));
  await expect(page.getByTestId('entity-service-title')).toHaveValue(values.title.slice(0, 16));
  await page.getByTestId('entity-service-title').fill(values.title);
  await page.getByTestId('entity-service-description').fill(values.description);
  await page.getByTestId('service-provider').fill(values.provider);
  await fillRequiredMetadata(page);
  await page.getByTestId('entity-service-save').click();
  await expect(page).toHaveURL(/\/portal\/services\/[0-9a-f-]+$/, { timeout: 30_000 });
  const serviceId = queryDatabase(
    `select id from public.services where title->>'ca' = ${sqlLiteral(values.title)} order by created_at desc limit 1`,
  );
  expect(serviceId).not.toBe('');
  createdServiceIds.push(serviceId);
  expect(
    queryDatabase(
      `select status || '|' || provider_name || '|' || (description->>'ca') from public.services where id = ${sqlLiteral(serviceId)}`,
    ),
  ).toBe(`pending|${values.provider}|${values.description}`);
  return serviceId;
}

test.describe.serial('staff service submission review queue', () => {
  test.afterAll(() => {
    if (createdServiceIds.length > 0) {
      queryDatabase(
        `delete from public.services where id in (${createdServiceIds.map(sqlLiteral).join(',')})`,
      );
    }
  });

  test('completes approval, live-edit review, rejection, secrecy, and role denial across two sessions', async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const entityContext = await browser.newContext({ locale: 'en-GB' });
    const staffContext = await browser.newContext({ locale: 'en-GB' });
    const entityPage = await entityContext.newPage();
    const staffPage = await staffContext.newPage();

    try {
      await Promise.all([signIn(entityPage, ENTITY_EMAIL), signIn(staffPage, STAFF_EMAIL)]);

      const title = `<img src=x onerror=alert(44)> Proposta Àgora ${RUN_TAG}`;
      const description = `Suport per a Zoë, أمينة i Наталія ${RUN_TAG}`;
      const provider = `Associació <script>alert(44)</script> Àgora ${RUN_TAG}`;
      const serviceId = await submitService(entityPage, { title, description, provider });

      await staffPage.goto('/content/services/reviews');
      await expect(staffPage.getByTestId('service-review-queue')).toBeVisible();
      const expectedQueueCount =
        Number(
          queryDatabase(
            `select count(*) from public.services where org_id = ${sqlLiteral(ORG_ID)} and status = 'pending'`,
          ),
        ) +
        Number(
          queryDatabase(
            "select count(*) from public.service_submission_notifications where kind = 'published_edit' and read_at is null",
          ),
        );
      await expect(staffPage.getByTestId('service-review-queue').locator('> li')).toHaveCount(
        Math.min(expectedQueueCount, 25),
      );
      const kinds = await staffPage
        .getByTestId('service-review-queue')
        .locator('> li')
        .evaluateAll((items) =>
          items.map((item) => ('innerText' in item ? String(item.innerText) : '')),
        );
      const firstLive = kinds.findIndex((value) => /Live published change/i.test(value));
      const lastPending = kinds.findLastIndex((value) => /Pending submission/i.test(value));
      expect(firstLive === -1 || lastPending < firstLive).toBe(true);

      await staffPage.getByTestId('service-review-category-filter').selectOption(CATEGORY_ID);
      await staffPage.getByTestId('service-review-kind-filter').selectOption('pending');
      await staffPage.getByTestId('service-review-query-filter').fill('Proposta Àgo');
      await expect(staffPage).toHaveURL(/[?&]kind=pending(?:&|$)/);
      await expect(staffPage).toHaveURL(new RegExp(`category=${CATEGORY_ID}`));
      await expect(staffPage.getByTestId(`service-review-item-${serviceId}`)).toBeVisible();
      await expect(staffPage.locator('main img[src="x"], main script')).toHaveCount(0);
      await staffPage.reload();
      await expect(staffPage.getByTestId('service-review-query-filter')).toHaveValue(
        'Proposta Àgo',
      );
      await staffPage.getByTestId(`service-review-item-${serviceId}`).getByRole('link').click();
      await expect(staffPage.getByTestId('service-approval-editor')).toBeVisible();
      await staffPage.goBack();
      await expect(staffPage.getByTestId('service-review-query-filter')).toHaveValue(
        'Proposta Àgo',
      );
      await staffPage.getByTestId(`service-review-item-${serviceId}`).getByRole('link').click();

      const internalNote = `Nota interna només equip Zoë ${RUN_TAG}`;
      await staffPage.getByTestId('service-review-comment-visibility').selectOption('internal');
      await staffPage.getByTestId('service-review-comment-body').fill(internalNote);
      await staffPage.getByTestId('service-review-comment-send').click();
      await expect(staffPage.getByText(internalNote)).toBeVisible();
      expect(
        queryDatabase(
          `select is_internal::text from public.service_submission_comments where service_id = ${sqlLiteral(serviceId)} and body = ${sqlLiteral(internalNote)}`,
        ),
      ).toBe('true');

      const approvalComment = `Aprovat després de la revisió humana ${RUN_TAG}`;
      const staffProvider = `Edició final de l'equip Àgora ${RUN_TAG}`;
      await staffPage.getByTestId('service-review-approval-comment').fill(approvalComment);
      await staffPage.getByTestId('service-provider').fill(staffProvider);
      await staffPage.getByTestId('service-generate-translations').click();
      await expect(staffPage.getByTestId('service-title-draft-es')).toBeVisible({
        timeout: 20_000,
      });
      await staffPage.getByTestId('service-title-approve-all').click();
      await staffPage.getByTestId('service-description-approve-all').click();
      await staffPage.getByTestId('service-approve').click();
      await expect(staffPage).toHaveURL(/\/content\/services\/reviews(?:\?.*)?$/, {
        timeout: 30_000,
      });
      expect(
        queryDatabase(
          `select status || '|' || provider_name || '|' || (select count(*) from jsonb_object_keys(title)) || '|' || (published_at <= now())::text from public.services where id = ${sqlLiteral(serviceId)}`,
        ),
      ).toBe(`published|${staffProvider}|5|true`);
      expect(
        queryDatabase(
          `select n.kind || '|' || c.body from public.service_submission_notifications n left join public.service_submission_comments c on c.id = n.decision_comment_id where n.service_id = ${sqlLiteral(serviceId)} and n.kind = 'approved' order by n.created_at desc limit 1`,
        ),
      ).toBe(`approved|${approvalComment}`);

      await entityPage.goto('/portal/services');
      await expect(entityPage.getByText(approvalComment)).toBeVisible();
      await expect(entityPage.getByText(internalNote)).toHaveCount(0);
      await entityPage.goto(`/portal/services/${serviceId}`);
      await expect(entityPage.getByText(internalNote)).toHaveCount(0);
      await expect(entityPage.getByText(approvalComment)).toBeVisible();
      const liveTitle = `<b>Publicat Àgora editat ${RUN_TAG}</b>`;
      await entityPage.getByTestId('entity-service-title').fill(liveTitle);
      await entityPage.getByTestId('entity-service-save').click();
      await expect
        .poll(() =>
          queryDatabase(
            `select status || '|' || (title->>'ca') from public.services where id = ${sqlLiteral(serviceId)}`,
          ),
        )
        .toBe(`published|${liveTitle}`);
      const liveNotificationId = queryDatabase(
        `select id from public.service_submission_notifications where service_id = ${sqlLiteral(serviceId)} and kind = 'published_edit' order by created_at desc limit 1`,
      );
      expect(
        queryDatabase(
          `select (previous_service->'title'->>'ca') || '|' || (current_service->'title'->>'ca') from public.service_submission_notifications where id = ${sqlLiteral(liveNotificationId)}`,
        ),
      ).toBe(`${title}|${liveTitle}`);

      await staffPage.goto('/content/services/reviews?kind=published_edit');
      await staffPage.getByTestId('service-review-query-filter').fill('Publicat Àgora');
      await expect(
        staffPage.getByTestId(`service-review-item-${liveNotificationId}`),
      ).toBeVisible();
      await staffPage
        .getByTestId(`service-review-item-${liveNotificationId}`)
        .getByRole('link')
        .click();
      const expectedDiffTitle = queryDatabase(
        `select current_service->'title'->>'ca' from public.service_submission_notifications where id = ${sqlLiteral(liveNotificationId)}`,
      );
      await expect(staffPage.getByTestId('service-review-diff')).toContainText(expectedDiffTitle);
      await expect(staffPage.getByText(internalNote)).toBeVisible();
      await staffPage.getByTestId('service-review-mark-reviewed').click();
      await expect
        .poll(() =>
          queryDatabase(
            `select (read_at is not null)::text from public.service_submission_notifications where id = ${sqlLiteral(liveNotificationId)}`,
          ),
        )
        .toBe('true');

      const rejectedTitle = `<svg onload=alert(45)> Rebuig Àgora ${RUN_TAG}`;
      const rejectedId = await submitService(entityPage, {
        title: rejectedTitle,
        description: `Falta validar el contacte Наталія ${RUN_TAG}`,
        provider: `Entitat Zoë ${RUN_TAG}`,
      });
      await staffPage.goto('/content/services/reviews?kind=pending');
      await staffPage.getByTestId('service-review-query-filter').fill('Rebuig Àgo');
      await staffPage.getByTestId(`service-review-item-${rejectedId}`).getByRole('link').click();
      await expect(staffPage.getByTestId('service-review-reject')).toBeDisabled();
      const rejectedInternal = `No mostrar aquesta nota ${RUN_TAG}`;
      await staffPage.getByTestId('service-review-comment-visibility').selectOption('internal');
      await staffPage.getByTestId('service-review-comment-body').fill(rejectedInternal);
      await staffPage.getByTestId('service-review-comment-send').click();
      const rejectionComment = `Cal confirmar el telèfon amb Zoë ${RUN_TAG}`;
      await staffPage.getByTestId('service-review-rejection-comment').fill(rejectionComment);
      await staffPage.getByTestId('service-review-reject').click();
      await expect(staffPage).toHaveURL(/\/content\/services\/reviews(?:\?.*)?$/, {
        timeout: 30_000,
      });
      expect(
        queryDatabase(
          `select status || '|' || rejection_reason from public.services where id = ${sqlLiteral(rejectedId)}`,
        ),
      ).toBe(`rejected|${rejectionComment}`);

      await entityPage.goto('/portal/services');
      await expect(entityPage.getByText(rejectionComment).first()).toBeVisible();
      await expect(entityPage.getByText(rejectedInternal)).toHaveCount(0);
      await entityPage.goto(`/portal/services/${rejectedId}`);
      await expect(entityPage.getByText(rejectionComment)).toBeVisible();
      await expect(entityPage.getByText(rejectedInternal)).toHaveCount(0);
      await expect(entityPage.locator('main svg[onload], main script, main b')).toHaveCount(0);

      await entityPage.goto('/content/services/reviews');
      await expect(entityPage).not.toHaveURL(/\/content\/services\/reviews/);
      await expect(entityPage.getByTestId('service-review-queue')).toHaveCount(0);
    } finally {
      await Promise.all([entityContext.close(), staffContext.close()]);
    }
  });
});
