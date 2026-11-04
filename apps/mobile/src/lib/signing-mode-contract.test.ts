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
    const start = screen.indexOf('const leave = async');
    const leave = screen.slice(start, screen.indexOf('const t = ', start));
    expect(leave.indexOf('await confirmOwner()')).toBeGreaterThan(-1);
    expect(leave.indexOf('await confirmOwner()')).toBeLessThan(leave.indexOf('end()'));
  });

  test('a link that lands back on signing mode keeps her language for the session', () => {
    expect(screen).toContain('keptLanguage?.startedAt === session?.startedAt');
  });

  test('a signing with no drawing needs the coach to confirm she agreed', () => {
    expect(screen).toContain(
      'Object.values(draft.signatures).includes(UNABLE_TO_DRAW) &&\n                !(await confirmOwner())',
    );
    expect(screen).toContain(
      'Object.values(strokes).includes(UNABLE_TO_DRAW) && !(await confirmOwner())',
    );
  });
});

describe('signing mode for a screen reader (RAPP-530)', () => {
  test('the language question is read in each language', () => {
    expect(screen).toContain('accessibilityLanguage={candidate}');
  });

  test("the form reads her language, the way back reads the coach's", () => {
    expect(screen).toContain('i18n.cloneInstance({ lng: language })');
    expect(screen).toContain('<I18nextProvider i18n={herI18n}>');
    expect(screen).toContain('<ScreenLanguageContext.Provider value={language}>');
    expect(screen).toContain('i18n.getFixedT(coachLanguage, \'participants\')');
  });

  test('the signature pad tells a screen reader user how to sign without drawing', () => {
    const signatureSection = readFileSync(
      resolve(import.meta.dir, '../components/authorization/signature-section.tsx'),
      'utf8',
    );
    const blockField = readFileSync(
      resolve(import.meta.dir, '../components/onboarding/signature-block-field.tsx'),
      'utf8',
    );
    expect(blockField).toContain('<SignatureSection');
    // A legal form may reword the hint (RAPP-773); the app's own hint is the fallback.
    expect(signatureSection).toContain(
      "accessibilityHint={texts.hint ?? t('authorizationSignatureHint')}",
    );
  });
});
