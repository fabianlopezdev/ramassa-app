import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';

// One colour per topic, and every coloured card opens onto its colour
// (RAPP-893). A card that carries a section colour opens a screen on the same
// wash, and that screen reads the shade through `useSectionWash`, so the card,
// the header and the page share one shade in the organization's brand.
const sourceRoot = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(sourceRoot, path), 'utf8');

function sources(directory: string): string[] {
  return readdirSync(join(sourceRoot, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(sourceRoot, path)).isDirectory()) return sources(path);
    const isSource = /\.tsx?$/.test(path) && !/\.(test|case)\./.test(path);
    return isSource ? [path] : [];
  });
}

// Each coloured card and the screen it opens. A new coloured card is one
// entry. A screen that finds its colour name first, such as a post's category,
// names the small hook it reads through; that hook must call the one reader.
interface ColouredPair {
  readonly card: string;
  readonly screen: string;
  readonly reader?: { readonly hook: string; readonly file: string };
}

function readsTheShade(pair: ColouredPair): boolean {
  const screen = read(pair.screen);
  if (pair.reader === undefined) return screen.includes('useSectionWash(');
  return screen.includes(pair.reader.hook) && read(pair.reader.file).includes('useSectionWash(');
}

const colouredPairs = [
  {
    card: 'components/services/service-category-grid.tsx',
    screen: 'app/(app)/service-category/[categoryId].tsx',
  },
  {
    card: 'components/knowledge/guide-category-grid.tsx',
    screen: 'app/(app)/guides/[categoryId].tsx',
  },
  {
    card: 'components/announcements/announcement-card.tsx',
    screen: 'app/(app)/announcement/[id].tsx',
    reader: { hook: 'useAnnouncementWash(', file: 'components/announcements/category-filters.tsx' },
  },
  {
    card: 'components/forum/forum-post-card.tsx',
    screen: 'app/(app)/forum/[id].tsx',
    reader: { hook: 'useForumPostWash(', file: 'lib/use-forum-post-wash.ts' },
  },
] as const satisfies readonly ColouredPair[];

const headerTag = /<NativeScreenHeader\b[\s\S]*?\/>/g;

// The loaded state is the last header a screen draws: the loading and error
// states return early, above it.
function loadedHeader(source: string): string | undefined {
  return (source.match(headerTag) ?? []).at(-1);
}

// Each check lists the screens that break it, so a failure names the file.
const colouredScreens = colouredPairs.map(({ screen }) => screen);

test('every coloured card and the screen it opens exist', () => {
  const files = colouredPairs.flatMap(({ card, screen }) => [card, screen]);
  expect(files.filter((path) => !existsSync(join(sourceRoot, path)))).toEqual([]);
});

test('every coloured screen reads its shade through useSectionWash', () => {
  expect(colouredPairs.filter((pair) => !readsTheShade(pair)).map(({ screen }) => screen)).toEqual(
    [],
  );
});

test('the header of every coloured screen takes the shade once loaded', () => {
  expect(
    colouredScreens.filter((path) => !loadedHeader(read(path))?.includes('backgroundColor=')),
  ).toEqual([]);
});

// Text from neutral-600 up reads at 4.5:1 on every wash, and neutral-500 does
// not (`packages/shared/section-colors.test.ts`). A screen on a wash keeps its
// lighter greys inside white cards, which live in their own components.
const washedScreens = [
  ...new Set([
    ...colouredScreens,
    ...sources('app').filter((path) => read(path).includes('useSectionWash(')),
  ]),
].filter((path) => existsSync(join(sourceRoot, path)));
const lightGreyText = /\btext-neutral-(?:300|400|500)\b/;

test('no screen on a wash draws light grey text in its own route file', () => {
  expect(washedScreens.filter((path) => lightGreyText.test(read(path)))).toEqual([]);
});

// A wash computed by another road would drift from the shade the card and
// its screen share. Only these places compute one, and the list only shrinks.
const computesAWash = /\b(?:categoryWash|sectionWash)\(|\bCATEGORY_WASH_STRENGTH\b/;
const mayComputeAWash = new Set([
  // The one reader: `useSectionWash` and the tone of a raised face.
  'components/layout/raised-surface.tsx',
  // The tiles of Serveis and Guies wash their icon circles inside a list
  // map, where a hook cannot run once per tile.
  'components/services/service-category-grid.tsx',
  'components/knowledge/guide-category-grid.tsx',
]);
const computingAWash = sources('.').filter((path) => computesAWash.test(read(path)));

test('no route or component computes a section wash by another road', () => {
  expect(computingAWash.filter((path) => !mayComputeAWash.has(path))).toEqual([]);
});

test('the list of places that compute a wash only shrinks', () => {
  expect([...mayComputeAWash].filter((path) => !computingAWash.includes(path))).toEqual([]);
});
