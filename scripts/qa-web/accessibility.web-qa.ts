import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { SEED_ACCESS_CODE } from '@ramassa/shared/testing';
import { ENTITY_EMAIL, queryDatabase, signIn, waitForHydration } from './session';

const wcagTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ADMIN_EMAIL = 'laia.ferrer@example.test';
const SEEDED = {
  announcement: '5eed0000-0000-4000-8001-000000000001',
  conversation: '5eed0000-0000-4000-800c-000000000001',
  entityReferral: '5eed0000-0000-4000-8010-000000000001',
  entityService: '5eed0000-0000-4000-800a-000000000011',
  event: '5eed0000-0000-4000-8003-000000000001',
  forumPost: '5eed0000-0000-4000-8010-000000000001',
  galleryItem: '5eed0000-0000-4000-8014-000000000001',
  knowledgeArticle: '5eed0000-0000-4000-8005-000000000001',
  participant: '5eed0000-0000-4000-8000-000000000011',
  service: '5eed0000-0000-4000-800a-000000000001',
  serviceReview: '5eed0000-0000-4000-800a-000000000011',
  survey: '5eed0000-0000-4000-8040-000000000001',
} as const;
const adminRouteGroups = {
  participants: [
    '/dashboard',
    '/participants',
    '/participants/new',
    '/participants/invites',
    '/participants/referrals',
    '/participants/deletion-requests',
    '/attendance',
  ],
  content: [
    '/content',
    '/content/announcements',
    '/content/announcements/new',
    '/content/events',
    '/content/events/new',
    '/content/events/categories',
    '/content/knowledge',
    '/content/knowledge/new',
    '/content/services',
    '/content/services/new',
    '/content/services/categories',
    '/content/services/reviews',
  ],
  operations: [
    '/data',
    '/feedback',
    '/forum',
    '/mentoring',
    '/messages',
    '/notifications',
    '/settings',
    '/surveys',
  ],
} as const;
const entityRoutes = [
  '/portal',
  '/portal/events',
  '/portal/messages',
  '/portal/referrals',
  '/portal/referrals/new',
  '/portal/services',
  '/portal/services/new',
] as const;
const playerOrigin = `http://localhost:${process.env.RAMASSA_QA_PLAYER_PORT ?? '4194'}`;
const playerRoutes = [
  '/',
  '/events',
  '/community',
  '/services',
  '/profile',
  '/attendance',
  '/feedback',
  '/gallery',
  '/knowledge',
  '/mentoring',
  '/messages',
  '/profile-delete-data',
  '/profile-edit',
  '/story/submit',
  '/team-chat',
  '/forum/create',
  '/gallery/upload',
] as const;

function attendanceOccurrenceId(): string {
  return queryDatabase(
    `select id from public.event_occurrences where event_id = '5eed0000-0000-4000-8003-000000000005' limit 1`,
  );
}

function dynamicAdminRoutes(): readonly string[] {
  return [
    `/attendance/${attendanceOccurrenceId()}`,
    `/content/announcements/${SEEDED.announcement}`,
    `/content/events/${SEEDED.event}`,
    `/content/knowledge/${SEEDED.knowledgeArticle}`,
    `/content/services/${SEEDED.service}`,
    `/content/services/reviews/${SEEDED.serviceReview}`,
    `/messages/${SEEDED.conversation}`,
    `/participants/${SEEDED.participant}`,
  ];
}

const dynamicEntityRoutes = [
  `/portal/referrals/${SEEDED.entityReferral}`,
  `/portal/services/${SEEDED.entityService}`,
] as const;

function dynamicPlayerRoutes(): readonly string[] {
  return [
    `/announcement/${SEEDED.announcement}`,
    `/event/${SEEDED.event}`,
    `/forum/${SEEDED.forumPost}`,
    `/gallery/${SEEDED.galleryItem}`,
    `/knowledge/${SEEDED.knowledgeArticle}`,
    `/messages/${SEEDED.conversation}`,
    `/service/${SEEDED.service}`,
    `/survey/${SEEDED.survey}`,
  ];
}

test.setTimeout(600_000);

function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations'],
): string {
  return violations
    .map(
      (violation) =>
        `${violation.id}: ${violation.help}\n${violation.nodes
          .map((node) => `  ${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
          .join('\n')}`,
    )
    .join('\n\n');
}

async function expectNoAxeViolations(page: Page, route: string): Promise<void> {
  const frames = page.locator('iframe');
  for (let index = 0; index < (await frames.count()); index += 1) {
    await expect(
      frames.nth(index),
      `${route}: embedded frame ${index + 1} needs an accessible title`,
    ).toHaveAttribute('title', /\S+/);
  }

  // Axe can enter a cross-origin frame when the provider permits it, but those
  // descendants belong to the provider and can change without a Ramassa
  // release. Ramassa owns the frame boundary above; axe owns our document.
  const results = await new AxeBuilder({ page }).exclude('iframe').withTags(wcagTags).analyze();
  expect(results.violations, `${route}\n${formatViolations(results.violations)}`).toEqual([]);
}

async function expectSkipLinkTargetsMain(page: Page): Promise<void> {
  await waitForHydration(page);
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
}

async function signInPlayer(page: Page): Promise<void> {
  await page.goto(`${playerOrigin}/access-code-login`, { waitUntil: 'domcontentloaded' });
  const accessCode = page.getByLabel(
    /Access code|Codi d'accés|Código de acceso|رمز الدخول|کد دسترسی/i,
  );
  await expect(accessCode).toBeVisible({ timeout: 30_000 });
  await accessCode.fill(SEED_ACCESS_CODE);
  await page.getByRole('button', { name: /^(Log in|Entra|Entrar|دخول|ورود)$/i }).click();
  await expect(page.getByTestId('open-knowledge-base')).toBeVisible({
    timeout: 30_000,
  });
}

async function expectRtlDocument(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
}

async function tabTo(page: Page, target: Locator, maximumPresses = 80): Promise<void> {
  for (let press = 0; press < maximumPresses; press += 1) {
    if (
      await target.evaluate(
        (element) =>
          element ===
          (globalThis as unknown as { readonly document: { readonly activeElement: unknown } })
            .document.activeElement,
      )
    ) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard focus did not reach ${await target.getAttribute('aria-label')}`);
}

test.describe('WCAG 2.2 AA regression gate', () => {
  test('admin login starts with a keyboard-visible skip link and has no axe violations', async ({
    page,
  }) => {
    await page.goto('/login');

    await expectSkipLinkTargetsMain(page);
    await expectNoAxeViolations(page, '/login');
  });

  for (const [group, routes] of Object.entries(adminRouteGroups)) {
    test(`static admin ${group} routes have no axe violations`, async ({ page }) => {
      await signIn(page, ADMIN_EMAIL);
      await expect(page.getByRole('heading', { name: 'Staff dashboard' })).toBeVisible({
        timeout: 30_000,
      });

      for (const route of routes) {
        await test.step(route, async () => {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('main')).toBeVisible();
          if (route === '/dashboard') await expectSkipLinkTargetsMain(page);
          await expectNoAxeViolations(page, route);
        });
      }
    });
  }

  test('destructive dialogs focus their task, trap keyboard focus, and restore the trigger', async ({
    page,
  }) => {
    await signIn(page, ADMIN_EMAIL);
    await expect(page.getByRole('heading', { name: 'Staff dashboard' })).toBeVisible({
      timeout: 30_000,
    });
    await page.goto('/participants/5eed0000-0000-4000-8000-000000000011');

    const trigger = page.getByRole('button', { name: 'Anonymize', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox')).toBeFocused();

    for (let press = 0; press < 6; press += 1) {
      await page.keyboard.press('Tab');
      await expect(dialog.locator(':focus')).toHaveCount(1);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('every practical seeded admin detail route has no axe violations', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await expect(page.getByRole('heading', { name: 'Staff dashboard' })).toBeVisible({
      timeout: 30_000,
    });

    for (const route of dynamicAdminRoutes()) {
      await test.step(route, async () => {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible();
        await expectNoAxeViolations(page, route);
      });
    }
  });

  test('every practical static entity route has a working bypass and no axe violations', async ({
    page,
  }) => {
    await signIn(page, ENTITY_EMAIL);
    await expect(page.getByRole('heading', { name: 'Entity impact and tracking' })).toBeVisible({
      timeout: 30_000,
    });

    for (const route of entityRoutes) {
      await test.step(route, async () => {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible();
        if (route === '/portal') await expectSkipLinkTargetsMain(page);
        await expectNoAxeViolations(page, route);
      });
    }
  });

  test('every practical seeded entity detail route has no axe violations', async ({ page }) => {
    await signIn(page, ENTITY_EMAIL);
    await expect(page.getByRole('heading', { name: 'Entity impact and tracking' })).toBeVisible({
      timeout: 30_000,
    });

    for (const route of dynamicEntityRoutes) {
      await test.step(route, async () => {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible();
        await expectNoAxeViolations(page, route);
      });
    }
  });

  test('every practical static player web route has no axe violations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInPlayer(page);

    for (const route of playerRoutes) {
      await test.step(route, async () => {
        await page.goto(`${playerOrigin}${route}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('body')).toBeVisible();
        await expectNoAxeViolations(page, `player${route}`);
      });
    }
  });

  test('every practical seeded player detail route has no axe violations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInPlayer(page);

    for (const route of dynamicPlayerRoutes()) {
      await test.step(route, async () => {
        await page.goto(`${playerOrigin}${route}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('body')).toBeVisible();
        await expectNoAxeViolations(page, `player${route}`);
      });
    }
  });

  test('Arabic staff and entity web routes retain RTL semantics and pass axe', async ({ page }) => {
    const adminOrigin = `http://localhost:${process.env.RAMASSA_QA_ADMIN_PORT ?? '4193'}`;
    await page.context().addCookies([{ name: 'ramassa.language', value: 'ar', url: adminOrigin }]);

    await signIn(page, ADMIN_EMAIL);
    for (const route of [...Object.values(adminRouteGroups).flat(), ...dynamicAdminRoutes()]) {
      await test.step(`staff ${route}`, async () => {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible();
        await expectRtlDocument(page);
        await expectNoAxeViolations(page, `Arabic staff ${route}`);
      });
    }

    await signIn(page, ENTITY_EMAIL);
    for (const route of [...entityRoutes, ...dynamicEntityRoutes]) {
      await test.step(`entity ${route}`, async () => {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible();
        await expectRtlDocument(page);
        await expectNoAxeViolations(page, `Arabic entity ${route}`);
      });
    }
  });

  test('Arabic player web routes retain RTL semantics and pass axe', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInPlayer(page);
    await page.goto(`${playerOrigin}/profile`);
    await page.getByTestId('profile-language-ar').click();

    for (const route of [...playerRoutes, ...dynamicPlayerRoutes()]) {
      await test.step(route, async () => {
        await page.goto(`${playerOrigin}${route}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('body')).toBeVisible();
        await expectRtlDocument(page);
        await expectNoAxeViolations(page, `Arabic player ${route}`);
      });
    }
  });

  test('keyboard-only route navigation moves focus into the destination page', async ({ page }) => {
    await signIn(page, ADMIN_EMAIL);
    await page.goto('/dashboard');
    const participantsLink = page.getByRole('link', { name: 'Participants', exact: true }).first();
    await tabTo(page, participantsLink);
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/participants');
    await expect(page.getByRole('heading', { name: 'Participants', exact: true })).toBeVisible();
    await expect(page.locator('#main-content')).toBeFocused();

    await signInPlayer(page);
    await page.goto(playerOrigin);
    const homeTab = page.getByRole('tab', { name: 'Home', exact: true });
    const eventsTab = page.getByRole('tab', { name: 'Events', exact: true });
    await tabTo(page, homeTab);
    await page.keyboard.press('ArrowRight');
    await expect(eventsTab).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/events$/);
    const activitiesHeading = page.getByRole('heading', { name: 'Activities', exact: true });
    await expect(activitiesHeading).toBeVisible();
    await expect(activitiesHeading).toBeFocused();
  });
});
