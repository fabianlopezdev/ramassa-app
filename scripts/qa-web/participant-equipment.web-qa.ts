/**
 * Recording what the team handed a participant, driven the way a staff member
 * drives it (RAPP-27).
 *
 * The assertion that matters is the last one in each spec: what the DATABASE
 * holds afterwards. A delivery log is only worth keeping if the value stored is
 * the value a report can count, and every way that goes wrong (an empty string
 * where a NULL belongs, a label stored instead of a token, a size on an item
 * that has none) looks perfectly fine on screen.
 *
 * Cleanup is by the ids this file created, never by a tag written into a column,
 * for the reason the RGPD suite learned the hard way.
 */

import { expect, test, type Page } from '@playwright/test';
import { countInDatabase, ENTITY_EMAIL, queryDatabase, signIn, STAFF_EMAIL } from './session';

const RUN_TAG = `qa${Date.now().toString(36)}`;

/** A seeded participant with no deliveries of her own, so counts start at zero. */
const SUBJECT = '5eed0000-0000-4000-8000-000000000025';

const createdDeliveryIds: string[] = [];

test.afterAll(() => {
  if (createdDeliveryIds.length === 0) return;
  const ids = createdDeliveryIds.map((id) => `'${id}'`).join(', ');
  // The table has no DELETE policy, on purpose, so this runs as the owner. That
  // is the suite cleaning up after itself, not a product path.
  queryDatabase(`delete from public.equipment_deliveries where id in (${ids})`);
});

/** Records the ids this run created, so afterAll can remove exactly those. */
function rememberNewDeliveries(): void {
  const ids = queryDatabase(
    `select string_agg(id::text, ',') from public.equipment_deliveries
      where profile_id = '${SUBJECT}'`,
  );
  for (const id of ids.split(',').filter((value) => value !== '')) {
    if (!createdDeliveryIds.includes(id)) createdDeliveryIds.push(id);
  }
}

async function recordDelivery(
  page: Page,
  fields: { readonly item: string; readonly size?: string; readonly note?: string },
): Promise<void> {
  await page.goto(`/participants/${SUBJECT}`);
  // PRESENT FIRST: the section is on screen before anything is typed into it.
  await expect(
    page.getByRole('heading', {
      name: /material lliurat|equipment handed over|material entregado/i,
    }),
  ).toBeVisible({ timeout: 20_000 });

  await page.locator('select').last().selectOption(fields.item);
  if (fields.size !== undefined) {
    await page.locator('input[id$="-size"]').fill(fields.size);
  }
  if (fields.note !== undefined) {
    await page.locator('input[id$="-note"]').fill(fields.note);
  }
  await page
    .getByRole('button', {
      name: /registra el lliurament|record the handover|registra la entrega/i,
    })
    .click();
}

test.describe('recording a handover', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  test.afterEach(() => {
    rememberNewDeliveries();
  });

  /**
   * The stored value is the TOKEN, not the label on screen. If the label were
   * stored, the season report would count "Botes" and "Boots" as two things the
   * moment a staff member switched language, and nobody would notice until the
   * report was wrong.
   */
  test('a delivery is stored as a catalog token, not as the label shown', async ({ page }) => {
    await recordDelivery(page, { item: 'boots', size: '38', note: `Prova ${RUN_TAG}` });

    await expect
      .poll(
        () =>
          queryDatabase(
            `select item || '|' || coalesce(size, 'NULL') || '|' || coalesce(note, 'NULL')
               from public.equipment_deliveries
              where profile_id = '${SUBJECT}' and note = 'Prova ${RUN_TAG}'`,
          ),
        { timeout: 15_000 },
      )
      .toBe(`boots|38|Prova ${RUN_TAG}`);

    // Attributed to the staff member who actually pressed the button, which is
    // the only reason the column exists.
    expect(
      queryDatabase(
        `select u.email from public.equipment_deliveries d
           join auth.users u on u.id = d.delivered_by
          where d.note = 'Prova ${RUN_TAG}'`,
      ),
    ).toBe(STAFF_EMAIL);
  });

  /**
   * An item with no size must store NULL. An empty string would sit in the
   * season report as a size nobody wears, next to the real ones, looking like
   * data.
   */
  test('an item that has no size stores null, and the form does not ask for one', async ({
    page,
  }) => {
    await page.goto(`/participants/${SUBJECT}`);
    await expect(
      page.getByRole('heading', {
        name: /material lliurat|equipment handed over|material entregado/i,
      }),
    ).toBeVisible({ timeout: 20_000 });

    await page.locator('select').last().selectOption('water_bottle');
    // The field is GONE, not merely ignored: a question that does nothing is a
    // question a staff member still has to answer.
    await expect(page.locator('input[id$="-size"]')).toHaveCount(0);

    await page.locator('input[id$="-note"]').fill(`Ampolla ${RUN_TAG}`);
    await page
      .getByRole('button', {
        name: /registra el lliurament|record the handover|registra la entrega/i,
      })
      .click();

    await expect
      .poll(
        () =>
          queryDatabase(
            `select item || '|' || coalesce(size, 'NULL') from public.equipment_deliveries
              where note = 'Ampolla ${RUN_TAG}'`,
          ),
        { timeout: 15_000 },
      )
      .toBe('water_bottle|NULL');
  });

  /**
   * And the other half: an item that DOES take a size must not be recordable
   * without one, or the report cannot say which sizes ran out.
   */
  test('boots without a size are refused with words, and nothing is recorded', async ({ page }) => {
    const before = countInDatabase(
      `select count(*) from public.equipment_deliveries where profile_id = '${SUBJECT}'`,
    );

    await recordDelivery(page, { item: 'boots', note: `Sense talla ${RUN_TAG}` });

    await expect(
      page.getByText(/necessita una talla|needs a size|necesita una talla/i),
    ).toBeVisible();
    expect(
      countInDatabase(
        `select count(*) from public.equipment_deliveries where profile_id = '${SUBJECT}'`,
      ),
    ).toBe(before);
  });

  /**
   * The log is append-only, and the screen says so. A staff member who believes
   * she can tidy an entry later writes something provisional; there is no way to
   * tidy it, so she must be told before she writes.
   */
  test('the log survives a reload and offers no way to remove an entry', async ({ page }) => {
    await recordDelivery(page, { item: 'jersey', size: 'M', note: `Persist ${RUN_TAG}` });

    await expect
      .poll(
        () =>
          countInDatabase(
            `select count(*) from public.equipment_deliveries where note = 'Persist ${RUN_TAG}'`,
          ),
        { timeout: 15_000 },
      )
      .toBe(1);

    await page.reload();
    // PRESENT FIRST, then the absence below means "not offered" rather than
    // "not painted yet".
    await expect(page.getByText(`Persist ${RUN_TAG}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /esborra|delete|elimina|borrar/i })).toHaveCount(
      0,
    );
  });
});

/**
 * The role boundary in the PRODUCT, not only in the policies. The log says which
 * women needed boots and when, which is an inference about somebody's
 * circumstances, and an entity contact must not be able to reach it.
 */
test('an entity contact never sees the delivery log', async ({ page }) => {
  await signIn(page, ENTITY_EMAIL);
  await page.goto(`/participants/${SUBJECT}`);

  // PRESENT FIRST: wait until the guard has actually decided something, so the
  // missing section below is a refusal rather than an unrendered page.
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).not.toContain(SUBJECT);
  await expect(
    page.getByRole('heading', {
      name: /material lliurat|equipment handed over|material entregado/i,
    }),
  ).toHaveCount(0);
});
