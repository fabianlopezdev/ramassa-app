import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PLAYER_ORIGIN, queryDatabase, signInPlayer } from './session';

const copy = JSON.parse(
  readFileSync('packages/shared/i18n/locales/ca/onboarding.json', 'utf8'),
) as Record<string, string>;
const text = (key: string) => {
  const value = copy[key];
  if (!value) throw new Error(`Missing copy ${key}`);
  return value;
};
test.use({ actionTimeout: 15_000 });

const next = async (page: Page, moves = true) => {
  const before = new URL(page.url()).pathname;
  await page.getByRole('button', { name: text('continueAction'), exact: true }).click();
  if (moves) await expect.poll(() => new URL(page.url()).pathname).not.toBe(before);
};
const current = (page: Page) => new URL(page.url()).pathname;

test('full Catalan onboarding saves branches, review edits, separate signatures and reaches Home', async ({
  page,
}) => {
  test.setTimeout(240_000);
  test.skip(
    process.env.RAMASSA_QA_DB_CONTAINER !== 'supabase_db_ramassa-qa',
    'Requires isolated seeded QA stack',
  );
  // This spec is deliberately limited to the isolated QA stack and its synthetic player.
  expect(process.env.RAMASSA_QA_DB_CONTAINER).toBe('supabase_db_ramassa-qa');
  const id = '5eed0000-0000-4000-8000-000000000099';
  expect(
    queryDatabase(`select count(*) from public.terms_acceptances where profile_id='${id}'`),
  ).toBe('0');
  await signInPlayer(page, 'onboarding@example.test', 'ca');
  await expect(page.getByTestId('onboarding-first-name')).toBeVisible();
  await page.getByTestId('onboarding-first-name').fill('Synthetic');
  await page.getByTestId('onboarding-last-name').fill('QA');
  await next(page);
  await page.getByTestId('onboarding-day').fill('90');
  await page.getByTestId('onboarding-month').fill('13');
  await page.getByTestId('onboarding-year').fill('1666');
  await next(page, false);
  await expect(page.getByText(text('errorBirthMonthRange'), { exact: true })).toBeVisible();
  await page.getByTestId('onboarding-day').fill('15');
  await page.getByTestId('onboarding-month').fill('5');
  await page.getByTestId('onboarding-year').fill('1995');
  await page.getByTestId('onboarding-place-of-birth').fill('Vic');
  await page.getByTestId('country-picker-open').click();
  await page.getByTestId('country-picker-search').fill('Espanya');
  await page.getByRole('button', { name: 'Espanya', exact: true }).click();
  await next(page);
  await page.getByTestId('onboarding-document-passport').click();
  await next(page);
  await page.getByTestId('onboarding-document-number').fill('QA123456');
  await next(page);
  await page
    .getByRole('radio', { name: text('noOption'), exact: true })
    .first()
    .click();
  await page
    .getByRole('radio', { name: text('noOption'), exact: true })
    .last()
    .click();
  await next(page);
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await page.getByRole('button', { name: '38', exact: true }).click();
  await next(page);
  const visited: string[] = [];
  for (let attempt = 0; attempt < 24 && !current(page).endsWith('/summary'); attempt++) {
    const route = current(page);
    visited.push(route);
    if (route.endsWith('/season'))
      await page.getByTestId('onboarding-applicant-status-other').click();
    else if (route.endsWith('/applicant-status-details'))
      await page
        .getByTestId('onboarding-applicant-status-details')
        .fill('Synthetic situation details');
    else if (route.endsWith('/specific-needs')) {
      await page.getByTestId('support-need-accessibility').click();
      await page.getByTestId('support-need-communication').click();
    } else if (route.includes('/specific-needs-details/'))
      await page.getByTestId('support-need-details-combined').fill('Synthetic combined support');
    else if (route.includes('/custom/')) {
      const fields = page.locator('input[data-testid$="-input"],textarea');
      for (let i = 0; i < (await fields.count()); i++) await fields.nth(i).fill('Synthetic answer');
      const option = page.getByRole('button', { name: /No|no/, exact: true });
      if (await option.count()) await option.first().click();
    }
    await next(page);
    await expect.poll(() => current(page)).not.toBe(route);
  }
  await expect(page.getByTestId('onboarding-summary-edit-identity')).toBeVisible();
  expect(visited).toContain('/onboarding/applicant-status-details');
  expect(visited.some((route) => route.includes('/specific-needs-details/'))).toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.getByTestId('onboarding-summary-edit-identity').click();
  await page
    .getByRole('textbox', { name: text('firstNameLabel'), exact: true })
    .fill('Synthetic revised');
  await expect(page.getByText(/Pas \d+ de \d+/).filter({ visible: true })).toHaveCount(0);
  await next(page);
  await expect(page.getByTestId('onboarding-summary-edit-identity')).toBeVisible();
  await page.getByRole('button', { name: text('summaryConfirmAction'), exact: true }).click();
  await page.getByRole('button', { name: text('termsReadFullAction'), exact: true }).click();
  await page.getByTestId('terms-acceptance').click();
  await page.getByTestId('terms-cannot-draw').click();
  await page.getByRole('button', { name: text('finishAction'), exact: true }).click();
  await expect(page.getByTestId('authorization-screen')).toBeVisible();
  expect(
    queryDatabase(`select count(*) from public.app_terms_signatures where profile_id='${id}'`),
  ).toBe('1');
  expect(
    queryDatabase(`select count(*) from public.authorization_signatures where profile_id='${id}'`),
  ).toBe('0');
  const action = page.getByTestId('authorization-sign');
  await expect(action).toBeDisabled();
  await expect
    .poll(() =>
      page.getByTestId('auth-scroll-content').evaluate((el) => {
        if (
          !('scrollTop' in el) ||
          typeof el.scrollTop !== 'number' ||
          !('scrollHeight' in el) ||
          typeof el.scrollHeight !== 'number'
        )
          return false;
        el.scrollTop = el.scrollHeight;
        return typeof el.scrollTop === 'number' && el.scrollTop > 0;
      }),
    )
    .toBe(true);
  await expect(action).toBeEnabled();
  await action.click();
  await page.getByTestId('authorization-health-no').click();
  await action.click();
  for (const consent of ['participation', 'data_processing', 'code_of_conduct', 'health_data'])
    await page.getByTestId(`authorization-consent-${consent}`).click();
  await page.getByTestId('authorization-cannot-draw').click();
  await action.click();
  await expect(page.getByTestId('open-knowledge-base')).toBeVisible({ timeout: 30_000 });
  expect(
    queryDatabase(`select count(*) from public.authorization_signatures where profile_id='${id}'`),
  ).toBe('1');
  expect(queryDatabase(`select document_type from public.profiles where id='${id}'`)).toBe(
    'passport',
  );
  expect(
    queryDatabase(
      `select public.decrypt_field(applicant_status_details) from public.profiles where id='${id}'`,
    ),
  ).toBe('Synthetic situation details');
  await page.goto(`${PLAYER_ORIGIN}/profile`);
});

for (const language of ['ca', 'es', 'en', 'ar', 'fa'] as const) {
  test(`personalized onboarding and document choices remain accessible in ${language}`, async ({
    page,
  }) => {
    test.skip(
      process.env.RAMASSA_QA_DB_CONTAINER !== 'supabase_db_ramassa-qa',
      'Requires isolated seeded QA stack',
    );
    const messages = JSON.parse(
      readFileSync(`packages/shared/i18n/locales/${language}/onboarding.json`, 'utf8'),
    ) as Record<string, string>;
    await signInPlayer(page, 'invited@example.test', language);
    await expect(page.getByTestId('onboarding-place-of-birth')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('onboarding-first-name')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      language === 'ar' || language === 'fa' ? 'rtl' : 'ltr',
    );
    await page.getByTestId('onboarding-place-of-birth').fill('Vic');
    await page.getByRole('button', { name: messages.continueAction, exact: true }).click();
    const choices = page.getByTestId(/^onboarding-document-(nie|passport|other|none|skip)$/);
    await expect(choices).toHaveCount(5);
    await expect(page.getByTestId('onboarding-document-other')).toBeVisible();
    const before = await page.getByTestId('onboarding-document-other').boundingBox();
    await page.getByTestId('onboarding-document-other').click();
    const after = await page.getByTestId('onboarding-document-other').boundingBox();
    expect(after?.height).toBe(before?.height);
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.getByRole('button', { name: messages.continueAction, exact: true }).click();
    await expect(page.getByTestId('onboarding-document-name')).toBeVisible();
    await expect(page.getByTestId('onboarding-document-number')).toBeVisible();
  });
}
