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

// Nothing is left on this list: the last dialog with flat buttons (delete my
// data) uses the shared raised button inside `NativeModalScope`. Nothing may
// be added.
const stillFlat = new Set<string>();

// A choice (one of several, or a tick) drawn by hand: a press control with a
// radio or checkbox role and its own border. Choices come from the shared
// raised pieces (`SelectionChoiceCard`, `RaisedChip`, `SelectionChoiceSurface`),
// so a chosen one fills the same way on every screen.
const flatChoice = /accessibilityRole="(?:radio|checkbox)"/;
const hasFlatChoice = (source: string) =>
  (source.match(pressTag) ?? []).some(
    (tag) => flatChoice.test(tag) && /className=[^>]*\bborder\b/.test(tag),
  );

const withFlatButton = [...sources('app'), ...sources('components')].filter((path) =>
  hasFlatButton(read(path)),
);

test('no screen draws a new flat button by hand', () => {
  expect(withFlatButton.filter((path) => !stillFlat.has(path))).toEqual([]);
});

test('no screen draws a choice by hand', () => {
  const withFlatChoice = [...sources('app'), ...sources('components')].filter((path) =>
    hasFlatChoice(read(path)),
  );
  expect(withFlatChoice).toEqual([]);
});

// A card, row or button that presses and draws its own border has no edge
// under it, so it looks flat. Tappable cards and rows come from `RaisedCard`
// (through `OpenableCard`, `RaisedIconCard` and the staff lists), and buttons
// from `RaisedActionButton`. Two places keep a border, each for a reason,
// and the list only shrinks.
const ownBorder = /className=[^>]*\bborder(?:-[a-z0-9-]+)?\b/;
const hasOwnBorder = (source: string) =>
  (source.match(pressTag) ?? []).some((tag) => ownBorder.test(tag));
const keepsABorder = new Set([
  // The rows of the wide participant table, with a line under each.
  'app/(app)/(team)/participants.tsx',
  // The time field of a mentoring request, drawn as a form field.
  'components/mentoring/mentoring-preference-pickers.tsx',
  // The pencil circle over her photo on Les meves dades (RAPP-888): a white
  // ring keeps the small badge apart from the photo under it.
  'components/profile/profile-photo-editor.tsx',
]);
const withOwnBorder = [...sources('app'), ...sources('components')].filter(
  (path) => !path.startsWith('components/motion/') && hasOwnBorder(read(path)),
);

test('no card, row or button that presses draws its own border', () => {
  expect(withOwnBorder.filter((path) => !keepsABorder.has(path))).toEqual([]);
  expect([...keepsABorder].filter((path) => !withOwnBorder.includes(path))).toEqual([]);
});

test('the list of flat leftovers only shrinks', () => {
  expect([...stillFlat].filter((path) => !withFlatButton.includes(path))).toEqual([]);
});

test('the shared pieces carry the relief', () => {
  const surface = read('components/forms/selection-choice-surface.tsx');
  // The edge takes the face's corners, smaller on a small icon button (RAPP-884).
  expect(surface).toContain('<RaisedSurfaceEdge shapeClassName={shapeClassName} />');
  for (const piece of [
    'components/forms/raised-action-button.tsx',
    'components/layout/raised-card.tsx',
    'components/layout/filter-chips.tsx',
  ]) {
    expect(read(piece)).toContain('<SelectionChoiceSurface');
  }
  // A sheet closes with the call to action, at its bottom edge (RAPP-881).
  expect(read('components/layout/app-sheet.tsx')).toContain('<AuthSubmitButton');
  // The call to action keeps its solid navy fill.
  expect(read('components/auth/auth-submit-button.tsx')).toContain("'bg-primary'");
  expect(read('components/services/service-card.tsx')).toContain('<RaisedCard');
  // The staff choice is the raised pill, and the onboarding choice card sits
  // on the raised surface.
  // A row that opens something is the raised card, and the staff inbox and
  // attendance rows come from the same pieces.
  expect(read('components/layout/openable-card.tsx')).toContain('<RaisedCard');
  expect(read('components/messaging/staff-conversation-card.tsx')).toContain('<RaisedCard');
  expect(read('components/attendance/attendance-occurrence-row.tsx')).toContain('<RaisedIconCard');
  // A row that marks attendance and a photo that opens are raised surfaces,
  // and the two dialogs answer with the shared buttons.
  expect(read('components/attendance/attendance-row.tsx')).toContain('<SelectionChoiceSurface');
  expect(read('components/gallery/gallery-tile.tsx')).toContain('<SelectionChoiceSurface');
  expect(read('components/push-permission-rationale.tsx')).toContain('<RaisedActionButton');
  expect(read('app/(app)/profile-delete-data.tsx')).toContain('<RaisedActionButton');
  expect(read('components/equipment/choice-option.tsx')).toContain('<RaisedChip');
  expect(read('components/auth/selection-choice-card.tsx')).toContain('<SelectionChoiceSurface');
});

// A player reports something to the staff with one control (RAPP-892): the red
// flag of the forum thread, also on a gallery photo or under a video. Only the
// shared button draws the flag, so the screens that report cannot drift apart.
test('every report control is the shared flag button', () => {
  expect(read('components/forum/forum-thread-message.tsx')).toContain('<ForumFlagButton');
  // The photo in the lightbox and the video screen share one piece for it (RAPP-931).
  expect(read('components/gallery/gallery-item-actions.tsx')).toContain('<ForumFlagButton');
  const drawFlag = [...sources('app'), ...sources('components')].filter((path) =>
    read(path).includes('icon="flag"'),
  );
  expect(drawFlag).toEqual(['components/forum/forum-flag-button.tsx']);
});
