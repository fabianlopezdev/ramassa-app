/**
 * Signing mode on a staff tablet (RAPP-305) must show only her authorization.
 * These checks read the layout and the screen, because the guarantees live in
 * how they are wired: a later screen added to the layout outside the guard, or a
 * way out that skips the coach's check, would open staff data to the player.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

const appDirectory = resolve(import.meta.dir, '../app/(app)');
const layout = readFileSync(resolve(appDirectory, '_layout.tsx'), 'utf8');
const screen = readFileSync(resolve(appDirectory, 'signing-mode.tsx'), 'utf8');

const screensIn = (source: string) =>
  [...source.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map(([, name]) => name);

describe('the layout in signing mode', () => {
  const start = layout.indexOf('{/* signing-mode-off:start');
  const end = layout.indexOf('{/* signing-mode-off:end */}');
  const guarded = layout.slice(start, end);

  test('every screen but signing mode sits inside the guard that signing mode turns off', () => {
    expect(start).toBeGreaterThan(-1);
    expect(guarded).toContain('<Stack.Protected guard={!isSigning}>');
    const all = screensIn(layout);
    const outside = all.filter((name) => !screensIn(guarded).includes(name));
    expect(outside).toEqual(['signing-mode']);
  });

  test('signing mode itself is reachable only while a session is open, with swipe back off', () => {
    expect(layout).toMatch(
      /<Stack\.Protected guard=\{isSigning\}>\s*<Stack\.Screen name="signing-mode" options=\{noSwipeBackOptions\} \/>/,
    );
  });

  test('any other path redirects to signing mode while it is open', () => {
    expect(layout).toContain("if (isSigning && pathname !== '/signing-mode')");
  });

  test('every route file under (app) is declared, so none escapes the guard', () => {
    const declared = new Set(screensIn(layout));
    const routeFiles = readdirSync(appDirectory).filter(
      (name) => name.endsWith('.tsx') && !name.startsWith('_'),
    );
    for (const file of routeFiles) {
      expect(declared.has(file.replace(/\.tsx$/, ''))).toBe(true);
    }
  });
});

describe('the signing mode screen', () => {
  test("a walk-in ticks her Onboarding's consents after the authorization, sent with her signing (RAPP-699)", () => {
    expect(screen).toContain('blocks.length > 0 || consents.length > 0');
    expect(screen).toContain('untickedRequiredConsents(consents, ticks)');
    expect(screen).toContain('consents: consentDecisionsPayload(consents, ticks)');
  });

  test("Android's back button stays in signing mode", () => {
    expect(screen).toContain("BackHandler.addEventListener('hardwareBackPress', () => true)");
  });

  test("leaving ends the session only after the coach's device check", () => {
    const leave = screen.slice(screen.indexOf('const leave = async'), screen.indexOf('const t = '));
    expect(leave.indexOf('await confirmOwner()')).toBeGreaterThan(-1);
    expect(leave.indexOf('await confirmOwner()')).toBeLessThan(leave.indexOf('end()'));
  });

  test('a link that lands back on signing mode keeps her language for the session', () => {
    expect(screen).toContain('keptLanguage?.startedAt === session?.startedAt');
  });

  test('a signing with no drawing needs the coach to confirm she agreed', () => {
    expect(screen).toContain('signing.unableToDraw && !(await confirmOwner())');
  });
});

describe('signing mode for a screen reader (RAPP-530)', () => {
  const form = readFileSync(
    resolve(import.meta.dir, '../components/authorization/authorization-form.tsx'),
    'utf8',
  );

  test('sections say whether they are open, and the reader uses her language', () => {
    expect(form).toContain('isExpanded={isOpen}');
    expect(form).toContain('accessibilityLanguage={language}');
    expect(screen).toContain('accessibilityLanguage={candidate}');
  });

  test('the signature pad tells a screen reader user how to sign without drawing', () => {
    const signatureSection = readFileSync(
      resolve(import.meta.dir, '../components/authorization/signature-section.tsx'),
      'utf8',
    );
    expect(form).toContain('<SignatureSection');
    // The version may reword the hint (RAPP-614); the app's own hint is the fallback.
    expect(signatureSection).toContain(
      "accessibilityHint={texts.hint ?? t('authorizationSignatureHint')}",
    );
  });
});
