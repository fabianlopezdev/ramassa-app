import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from 'bun:test';

// Every screen titles its sections the way Inici does (RAPP-872): one shared
// section, so a size or a gap changes in one place for the whole app.
const sourceRoot = join(import.meta.dir, '..');
const read = (path: string) => readFileSync(join(sourceRoot, path), 'utf8');

function screenFiles(directory: string): string[] {
  return readdirSync(join(sourceRoot, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(sourceRoot, path)).isDirectory()) return screenFiles(path);
    return path.endsWith('.tsx') && !path.includes('.test.') ? [path] : [];
  });
}

test('the shared section keeps the Inici title, gaps and divider', () => {
  const section = read('components/layout/screen-section.tsx');
  expect(section).toContain('accessibilityRole="header"');
  expect(section).toContain('text-start text-2xl font-bold text-neutral-900');
  expect(section).toContain('className="gap-lg"');
  expect(section).toContain('className="gap-md"');
  expect(section).toContain('<Divider />');
});

test('Inici has no section of its own any more', () => {
  const homeFolder = readdirSync(join(sourceRoot, 'components/home'));
  expect(homeFolder).not.toContain('home-section.tsx');
  expect(homeFolder).not.toContain('home-section-header.tsx');
});

test('no screen defines its own Section component', () => {
  const offenders = screenFiles('app').filter((path) => /\nfunction Section\(/.test(read(path)));
  expect(offenders).toEqual([]);
});

// Headings that are not section titles: a confirm card, a notice card, and the
// title of one request. Anything else at these sizes is a section title.
const notSectionTitles = new Set([
  'app/(app)/forum/[id].tsx',
  'app/(app)/mentoring/[id].tsx',
  'app/(app)/mentoring/index.tsx',
]);

test('no screen draws a section title by hand', () => {
  const handMade =
    /accessibilityRole="header"\s*\n\s*className=\{`text-start text-(lg|xl) font-bold/;
  const offenders = screenFiles('app').filter(
    (path) => !notSectionTitles.has(path) && handMade.test(read(path)),
  );
  expect(offenders).toEqual([]);
});

// Components draw section titles too (RAPP-889): the profile cards drew their
// own, and the scan above only reads route files. These headings are not
// section titles: a block a staff member wrote into a form, three cards of one
// service review, a numbered heading inside an article, the title of one
// article card, and the places left on an event.
const componentHeadingsThatAreNotSectionTitles = new Set([
  'components/forms/text-block.tsx',
  'components/content/service-review-detail.tsx',
  'components/knowledge/player-structured-content-shared.tsx',
  'components/knowledge/knowledge-article-card.tsx',
  'components/events/event-article.tsx',
]);

test('no component draws a section title by hand', () => {
  const handMade =
    /accessibilityRole="header"\s*\n\s*className=\{`text-start text-(form|lg|xl) font-(semibold|bold)/;
  const offenders = screenFiles('components').filter(
    (path) =>
      !path.startsWith('components/dev/') &&
      !path.includes('.case.') &&
      !componentHeadingsThatAreNotSectionTitles.has(path) &&
      handMade.test(read(path)),
  );
  expect(offenders).toEqual([]);
});

test('no screen or component keeps a section label helper of its own', () => {
  const localHelper = /\nfunction Section(Header|Heading|Title)\(/;
  const offenders = [...screenFiles('app'), ...screenFiles('components')].filter(
    (path) => path !== 'components/layout/screen-section.tsx' && localHelper.test(read(path)),
  );
  expect(offenders).toEqual([]);
});

test('the five player tabs draw no heading of their own', () => {
  const tabs = screenFiles('app/(app)/(tabs)').filter((path) => !path.endsWith('_layout.tsx'));
  expect(tabs).toHaveLength(5);
  const offenders = tabs.filter((path) => read(path).includes('accessibilityRole="header"'));
  expect(offenders.map((path) => relative('app', path))).toEqual([]);
});
