import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

// A screen's call to action sits at the bottom of the screen (RAPP-881), as in
// onboarding and on the player tabs. A screen that shows the call to action
// places it through one of the shared bottom pieces.
const sourceRoot = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(sourceRoot, path), 'utf8');

function screens(directory: string): string[] {
  return readdirSync(join(sourceRoot, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(sourceRoot, path)).isDirectory()) return screens(path);
    return path.endsWith('.tsx') && !/\.(test|case)\./.test(path) ? [path] : [];
  });
}

// `AuthActionFooter` is the footer of the sign-in screens; the profile and
// survey frames take the action and place it through `ActionScreen`.
const bottomPiece =
  /<ActionScreen|<ScreenAction|<FormScreen|<TabScreenAction|<AuthActionFooter|FormWalk|<(?:ProfileScreenFrame|SurveyScreenFrame)\b[^>]*\baction=/;

// Screens where the navy button is not the screen's call to action: a retry
// inside an error state, or one action per row or per section. They keep it
// where it acts. A screen leaves this list when it no longer has one; nothing
// may be added without that reason.
const stillInContent = new Set([
  'app/(app)/gallery/[id].tsx',
  'app/(app)/profile-privacy.tsx',
  'app/(app)/team-data.tsx',
  'app/(app)/team-feedback.tsx',
]);

const withActionInContent = screens('app').filter((path) => {
  const source = read(path);
  return source.includes('<AuthSubmitButton') && !bottomPiece.test(source);
});

test('a screen with a call to action places it at the bottom', () => {
  expect(withActionInContent.filter((path) => !stillInContent.has(path))).toEqual([]);
});

test('the list of exceptions only shrinks', () => {
  expect([...stillInContent].filter((path) => !withActionInContent.includes(path))).toEqual([]);
});

test('the bottom action keeps to the bottom and above the keyboard', () => {
  const piece = read('components/layout/screen-action.tsx');
  expect(piece).toContain('<KeyboardAvoidingView');
  expect(piece).toContain('edges={BOTTOM_EDGE}');
  expect(piece).toContain('HeaderHeightContext');
  const sheet = read('components/layout/app-sheet.tsx');
  expect(sheet).toMatch(/\{action \?\? \(\s*<AuthSubmitButton/);
});
