import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

// Every button, pill and card that presses has the raised relief of the five
// tabs (RAPP-878). They come from the shared pieces, so no screen draws a flat
// button by hand.
//
// One look stays flat on purpose: the solid navy call to action that onboarding
// uses (`AuthSubmitButton`), the main action of a screen. Fabián, 2026-11-20:
// "Those that are like that should stay like that." So a navy fill is not read
// as a flat button here.
const sourceRoot = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(sourceRoot, path), 'utf8');

function sources(directory: string): string[] {
  return readdirSync(join(sourceRoot, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(sourceRoot, path)).isDirectory()) return sources(path);
    const isSource = path.endsWith('.tsx') && !/\.(test|case)\./.test(path);
    return isSource && !path.startsWith('components/dev/') ? [path] : [];
  });
}

// A press target drawn by hand as a flat button or capsule: a thin border or a
// red fill, with no edge under it. Text fields keep their flat field style, so
// only the opening tags of press controls are read.
const pressTag = /<Pressable(?:Scale)?\b[\s\S]*?(?:\n\s*>|\/>)/g;
const flatLook =
  /min-h-(?:recommended|tap)[^"`]*rounded-(?:md|full)[^"`]*(?:bg-error|border border-(?:primary|neutral-300|error))|rounded-(?:md|full)[^"`]*(?:bg-error|border border-(?:primary|neutral-300|error))[^"`]*min-h-(?:recommended|tap)/;
const hasFlatButton = (source: string) =>
  (source.match(pressTag) ?? []).some((tag) => flatLook.test(tag));

// Still drawn by hand on 2026-11-20. Each one leaves this list when it moves to
// a shared raised piece; nothing may be added.
const stillFlat = new Set([
  'app/(app)/item-type/[id].tsx',
  'app/(app)/photo-handoff/[id].tsx',
  'app/(app)/profile-delete-data.tsx',
  'app/(app)/signing-mode.tsx',
  'app/(app)/team-data.tsx',
  'app/(app)/team-feedback.tsx',
  'components/auth/account-notice-screen.tsx',
  'components/auth/app-lock-link.tsx',
  'components/auth/app-lock.tsx',
  'components/auth/second-factor-screen.tsx',
  'components/auth/step-up.tsx',
  'components/authorization/reregistration-steps.tsx',
  'components/forum/forum-flag-dialog.tsx',
  'components/participants/invite-sheet.tsx',
  'components/participants/participant-card.tsx',
  'components/participants/participant-rgpd.tsx',
]);

const withFlatButton = [...sources('app'), ...sources('components')].filter((path) =>
  hasFlatButton(read(path)),
);

test('no screen draws a new flat button by hand', () => {
  expect(withFlatButton.filter((path) => !stillFlat.has(path))).toEqual([]);
});

test('the list of flat leftovers only shrinks', () => {
  expect([...stillFlat].filter((path) => !withFlatButton.includes(path))).toEqual([]);
});

test('the shared pieces carry the relief', () => {
  const surface = read('components/forms/selection-choice-surface.tsx');
  expect(surface).toContain('<RaisedSurfaceEdge />');
  for (const piece of [
    'components/forms/raised-action-button.tsx',
    'components/layout/raised-card.tsx',
    'components/layout/filter-chips.tsx',
  ]) {
    expect(read(piece)).toContain('<SelectionChoiceSurface');
  }
  expect(read('components/layout/app-sheet.tsx')).toContain('<RaisedActionButton');
  // The call to action keeps its solid navy fill.
  expect(read('components/auth/auth-submit-button.tsx')).toContain("'bg-primary'");
  expect(read('components/services/service-card.tsx')).toContain('<RaisedCard');
});
