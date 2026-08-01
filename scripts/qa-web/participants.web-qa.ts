/**
 * The participants roster, driven the way a staff member drives it (RAPP-99).
 *
 * WHY THIS FILE EXISTS. The participants search shipped unable to match a
 * half-typed word or a word typed with its accents, and both had been reported
 * as verified. The pgTAP assertion wrapped the query in `immutable_unaccent` by
 * hand, so it tested the database along a path the app never takes; the browser
 * check used a complete, unaccented word, which behaves identically whether the
 * search works or not. Two real checks, neither able to fail.
 *
 * So every assertion here goes through the product: a real login, real typing
 * into the real input, real clicks on real headers. And every one of them was
 * checked against the BROKEN build before being trusted — a suite that has
 * never failed is a suite nobody has tested.
 *
 * Expected counts are read from the database at runtime rather than hardcoded,
 * so the suite states a relationship ("the table shows what the database holds")
 * instead of a number that quietly rots when the seeds change.
 */

import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const STAFF_EMAIL = 'marta.puig@example.test';
const ENTITY_EMAIL = 'silvia.bosch@example.test';
const SEED_PASSWORD = 'ramassa-dev-password';

/**
 * Counts read straight from the local database, through psql in the Supabase
 * container rather than through the app's own client. Asking the app what it
 * expects to show would be circular: the bugs this suite exists to catch are
 * exactly the ones where the app is confidently wrong.
 */
function countInDatabase(where: string): number {
  const container = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n')
    .find((name) => name.startsWith('supabase_db_'));
  if (container === undefined) {
    throw new Error('No local Supabase database container is running: bun run db:start');
  }
  const output = execFileSync(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-t',
      '-A',
      '-c',
      `select count(*) from public.profiles where role = 'player' and ${where}`,
    ],
    { encoding: 'utf8' },
  );
  return Number(output.trim());
}

/**
 * Signs in the way a person does: the password path, because local mail is not
 * wired up.
 *
 * The toggle is clicked with a RETRY, which is not paranoia. The admin is
 * server-rendered, so on a cold load the button exists in the markup before
 * React has attached its handler, and a click in that window does nothing at
 * all. A person never notices; an automated run hits it every time and reads
 * as "the login page is broken".
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  const usePassword = page.getByRole('button', { name: /contrasenya|password/i }).first();
  await expect(usePassword).toBeVisible();

  await expect(async () => {
    await usePassword.click();
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(SEED_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}

async function gotoRoster(page: Page): Promise<void> {
  await page.goto('/participants');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** What the header says, e.g. "20 participants", as a number. */
async function shownTotal(page: Page): Promise<number> {
  const summary = await page.locator('header p').first().innerText();
  const digits = summary.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}

test.describe('participants roster', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STAFF_EMAIL);
  });

  test('shows every participant the database holds', async ({ page }) => {
    await gotoRoster(page);
    expect(await shownTotal(page)).toBe(countInDatabase('true'));
  });

  /**
   * THE ONE THAT WAS BROKEN. Typed one character at a time into the real input,
   * because that is the only way to exercise what the box does between words:
   * with whole-token matching this finds nothing while Yolanda is on screen.
   */
  test('a half-typed name finds the person, before the word is finished', async ({ page }) => {
    await gotoRoster(page);
    const search = page.getByRole('searchbox');
    await search.pressSequentially('yo', { delay: 60 });

    // Wait for the term to be COMMITTED to the URL first. Without this the
    // assertion runs against the still-unfiltered table, where Yolanda is
    // visible anyway, and passes on a build where the search matches nothing:
    // the first version of this very spec did exactly that.
    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('q=yo');
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('cell', { name: /Yolanda/ })).toBeVisible();
  });

  /**
   * THE OTHER ONE. "torello" worked before the fix and "Torelló" did not, so the
   * accented spelling is the assertion that matters; the folded one is kept
   * beside it because the pair is the actual promise.
   */
  test('a town typed WITH its accents finds the same people as without', async ({ page }) => {
    const expected = countInDatabase(`city = 'Torelló'`);
    expect(expected).toBeGreaterThan(0);

    await gotoRoster(page);
    const search = page.getByRole('searchbox');

    await search.fill('Torelló');
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBe(expected);

    await search.fill('torello');
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBe(expected);
  });

  test('names in Arabic and Cyrillic are searchable in their own script', async ({ page }) => {
    await gotoRoster(page);
    const search = page.getByRole('searchbox');

    await search.fill('أمينة');
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBeGreaterThan(0);

    await search.fill('Оксана');
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBeGreaterThan(0);
  });

  /**
   * The deliberate limitation, asserted so nobody "fixes" it by indexing the
   * plaintext of an encrypted column.
   */
  test('a document number finds nobody: encrypted fields are not searchable', async ({ page }) => {
    await gotoRoster(page);
    await page.getByRole('searchbox').fill('Y0000011Z');
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBe(0);
  });

  test('a hostile search term degrades to an empty table, not an error', async ({ page }) => {
    await gotoRoster(page);
    await page.getByRole('searchbox').fill("') | (1=1-- & !");
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBe(0);
    await expect(page.getByText(/no participants|cap participant/i)).toBeVisible();
  });

  for (const filter of [
    { name: 'status', query: 'status=inactive', where: 'is_active = false' },
    { name: 'dependants', query: 'dependents=with', where: 'has_dependents = true' },
    {
      name: 'entity',
      query: 'entity=Creu%20Roja%20Osona',
      where: `reference_entity = 'Creu Roja Osona'`,
    },
    { name: 'nationality', query: 'nationality=Ucra%C3%AFna', where: `nationality = 'Ucraïna'` },
  ]) {
    test(`the ${filter.name} filter shows exactly what the database holds`, async ({ page }) => {
      const expected = countInDatabase(filter.where);
      expect(expected).toBeGreaterThan(0);

      await page.goto(`/participants?${filter.query}`);
      await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBe(expected);
    });
  }

  test('clicking a column header sorts, and says so out loud', async ({ page }) => {
    await gotoRoster(page);
    const townHeader = page.getByRole('button', { name: /town|població/i });
    await townHeader.click();

    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('sort=city');
    // Announced, not just painted: the arrow is invisible to a screen reader.
    await expect(page.locator('th', { has: townHeader })).toHaveAttribute('aria-sort', 'ascending');

    await townHeader.click();
    await expect.poll(() => page.url(), { timeout: 10_000 }).toContain('dir=desc');
  });

  /**
   * The URL is the whole state model of this screen, so it is worth asserting
   * as behaviour rather than as an implementation detail: a filtered view has
   * to survive being sent to a colleague and being reloaded.
   */
  test('a filtered view survives a reload and the back button', async ({ page }) => {
    await gotoRoster(page);
    const before = await shownTotal(page);

    await page.getByRole('searchbox').pressSequentially('manlleu', { delay: 40 });
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBeLessThan(before);
    const filtered = await shownTotal(page);

    await page.reload();
    expect(await shownTotal(page)).toBe(filtered);

    await page.goBack();
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBe(before);
  });

  test('the empty state offers a way out instead of just saying no', async ({ page }) => {
    await page.goto('/participants?q=zzzzzzzz');
    await expect(page.getByText(/no participants|cap participant/i)).toBeVisible();

    await page.getByRole('button', { name: /clear filters|treu els filtres/i }).click();
    await expect.poll(() => shownTotal(page), { timeout: 10_000 }).toBe(countInDatabase('true'));
  });
});

/**
 * The role boundary in the PRODUCT, not only in the policies.
 *
 * The guarantee turned out to be stronger than this test first assumed: an
 * entity contact who types the roster's URL is not shown an empty table, she is
 * routed to her own portal and never reaches the screen. Asserting the weaker
 * "sees zero rows" would have passed on a build that rendered her the roster
 * shell, so the assertion is that she ends up somewhere else entirely and the
 * table is not on the page.
 *
 * RLS is the second line and is asserted in pgTAP: even if routing let her
 * through, the database returns nothing.
 */
test('an entity contact is routed away from the roster, not shown an empty one', async ({
  page,
}) => {
  await signIn(page, ENTITY_EMAIL);
  await page.goto('/participants');

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
    .not.toBe('/participants');
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.locator('table')).toHaveCount(0);
});
