import { describe, expect, test } from 'bun:test';
import { tokens } from '@ramassa/shared/tokens';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();
const locales = ['ca', 'es', 'en', 'fr', 'ar', 'fa'] as const;

describe('the club logo in Inici, the profile and the chat (RAPP-907)', () => {
  test('Inici opens with the logo, "Hola," and her first name in place of the tab name', async () => {
    const [home, greeting, header] = await Promise.all([
      read('../app/(app)/(tabs)/index.tsx'),
      read('../components/home/home-greeting.tsx'),
      read('../components/profile/player-tab-header.tsx'),
    ]);

    expect(home).toContain('<PlayerTabHeader title={<HomeGreeting />} />');
    expect(home.match(/<PlayerTabStateFrame title=\{<HomeGreeting \/>\}>/g)).toHaveLength(2);
    expect(home).not.toContain("title={t('nav:tabs.home')}");

    expect(greeting).toContain('<PublicOrganizationLogo variant="header" />');
    expect(greeting).toContain("t('greeting')");
    expect(greeting).toContain('useOwnPersonCard()');
    expect(greeting).toContain('accessibilityRole="header"');

    // Her photo stays at the end of the row on every tab, Inici included.
    expect(header).toContain('<ProfilePhotoButton />');
  });

  test('every language greets her with its own comma', async () => {
    for (const locale of locales) {
      const home = await Bun.file(
        new URL(`../../../../packages/shared/i18n/locales/${locale}/home.json`, import.meta.url),
      ).json();
      expect(home.greeting).toMatch(/[,،]$/);
    }
  });

  test('the profile shows the logo directly above the funding line', async () => {
    const profile = await read('../app/(app)/profile.tsx');
    const logo = profile.indexOf('<PublicOrganizationLogo variant="footer" />');
    const funding = profile.indexOf("t('common:fundingAcknowledgment')");

    expect(logo).toBeGreaterThan(-1);
    expect(funding).toBeGreaterThan(logo);
  });

  test('the chat draws the logo large and faint behind its messages, hidden from screen readers', async () => {
    const [thread, logo] = await Promise.all([
      read('../components/messaging/message-thread.tsx'),
      read('../components/branding/public-organization-logo.tsx'),
    ]);

    const backdrop = thread.indexOf('<PublicOrganizationLogo variant="backdrop" />');
    expect(backdrop).toBeGreaterThan(-1);
    expect(thread.indexOf('<FlashList', backdrop)).toBeGreaterThan(backdrop);

    expect(logo).toContain('pointerEvents="none"');
    expect(logo).toContain('importantForAccessibility="no-hide-descendants"');
    expect(logo).toContain('accessibilityElementsHidden');
    expect(logo).toContain('opacity: tokens.brandLogo.backdropOpacity');
    expect(tokens.brandLogo.backdropOpacity).toBeLessThanOrEqual(0.1);
    expect(tokens.brandLogo.backdropHeight).toBeGreaterThan(tokens.brandLogo.footerHeight);
  });

  test('the bundled shield sits where the loaded logo will, so Inici does not jump (RAPP-947)', async () => {
    const logo = await read('../components/branding/public-organization-logo.tsx');

    // An expo-image placeholder is always centred; the header logo sits at the row's start.
    expect(logo).not.toContain('placeholder=');
    expect(logo).toContain('source={BUNDLED_CLUB_LOGO}');
    expect(logo.match(/contentPosition=\{contentPosition\}/g)).toHaveLength(2);
  });
});
