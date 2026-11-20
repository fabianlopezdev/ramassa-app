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

const bottomPiece = /<ActionScreen|<ScreenAction|<FormScreen|<TabScreenAction|FormWalk/;

// Screens that still show the call to action inside their content on
// 2026-11-20: a retry in an error state, an action per list row, a profile
// frame with its own footer, or a tab of the entity shell. Each leaves this
// list when its action moves to the bottom; nothing may be added.
const stillInContent = new Set([
  'app/(app)/(entity)/entity-referrals.tsx',
  'app/(app)/gallery/[id].tsx',
  'app/(app)/photo-handoff/[id].tsx',
  'app/(app)/profile-data.tsx',
  'app/(app)/profile-privacy.tsx',
  'app/(app)/survey/[id].tsx',
  'app/(app)/team-data.tsx',
  'app/(app)/team-feedback.tsx',
  'app/(auth)/index.tsx',
]);

const withActionInContent = screens('app').filter((path) => {
  const source = read(path);
  return source.includes('<AuthSubmitButton') && !bottomPiece.test(source);
});

test('a screen with a call to action places it at the bottom', () => {
  expect(withActionInContent.filter((path) => !stillInContent.has(path))).toEqual([]);
});

test('the list of screens with the action in their content only shrinks', () => {
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
