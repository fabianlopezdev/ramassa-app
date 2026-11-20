/**
 * The app's icon set (RAPP-834): from the SVG files to the path data the app draws.
 *
 *   docs/design/icons/svg/<name>.<weight>.svg         the source, in the repository
 *           v
 *   scripts/generate-icons.ts                         this file: reads, checks, refuses a bad set
 *           v
 *   apps/mobile/src/components/icons/icon-set.ts      path data, generated
 *           v
 *   <Icon name="home" />                              every screen
 *
 *   bun run icons:gen                     write icon-set.ts from the folder
 *   bun run icons:check                   fail when icon-set.ts no longer matches the folder
 *   bun run icons:fetch [name ...]        refill the folder from the Solar set (all, or the names given)
 *
 * The same pictures show on iPhone and Android because the app draws them
 * itself, where the phone's own symbols differ from one system to the other.
 *
 * THE SET is Solar by 480 Design, under CC BY 4.0. That licence asks for a
 * credit a person can reach in the app, so `LICENCE` travels into the
 * generated file as data and her profile renders it.
 *
 * THE FOLDER IS THE SOURCE, and no package is. Changing a picture, or the whole
 * set, means replacing files in the folder and running `icons:gen`; no screen
 * changes, because screens ask for OUR names.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

const ROOT = resolve(import.meta.dirname, '..');
const SVG_DIR = resolve(ROOT, 'docs/design/icons/svg');
const OUT = resolve(ROOT, 'apps/mobile/src/components/icons/icon-set.ts');

/** The grid every icon is drawn on. One grid, so one `size` is enough to place any icon. */
const GRID = 24;
const VIEW_BOX = `0 0 ${GRID} ${GRID}`;

/**
 * Two weights, and what each is for. `linear` is the working weight: rows,
 * arrows, anything repeated. `boldDuotone` is for an icon that is the subject,
 * such as the selected tab or the picture at the start of a card.
 */
const WEIGHTS = { linear: 'linear', boldDuotone: 'bold-duotone' } as const;

const FETCH_PAUSE_MS = 200;

const LICENCE = {
  set: 'Solar',
  author: '480 Design',
  licence: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  source: 'https://github.com/480-Design/Solar-Icon-Set',
  credit: 'Icons by 480 Design (Solar), CC BY 4.0',
} as const;

/**
 * Our name on the left, the set's name on the right. OUR names are what
 * screens ask for and what survives a change of set, so they name the picture
 * ("clipboard") and never the job ("to do").
 */
const ICONS: Readonly<Record<string, string>> = {
  book: 'book',
  briefcase: 'case',
  buildings: 'buildings',
  calendar: 'calendar',
  'calendar-check': 'calendar-check',
  chart: 'chart-2',
  chat: 'chat-round',
  'chat-text': 'chat-round-line',
  chats: 'dialog-2',
  check: 'check',
  'check-circle': 'check-circle',
  'chevron-down': 'alt-arrow-down',
  'chevron-left': 'alt-arrow-left',
  'chevron-right': 'alt-arrow-right',
  'chevron-up': 'alt-arrow-up',
  circle: 'circle',
  clipboard: 'clipboard-list',
  clock: 'clock-circle',
  close: 'close',
  'close-circle': 'close-circle',
  document: 'document-text',
  dumbbell: 'dumbbell',
  football: 'football',
  gallery: 'gallery',
  'gallery-add': 'gallery-add',
  globe: 'global',
  'graduation-cap': 'square-academic-cap',
  grid: 'widget',
  heart: 'heart',
  'heart-pulse': 'heart-pulse',
  // The set's plain `home` in bold duotone is built from a mask, which this
  // script does not read; `home-smile` is paths only.
  home: 'home-smile',
  'id-card': 'user-id',
  'info-circle': 'info-circle',
  lightbulb: 'lightbulb',
  list: 'list',
  lock: 'lock-keyhole',
  logout: 'logout-2',
  'map-point': 'map-point',
  masks: 'masks',
  more: 'menu-dots-circle',
  pen: 'pen',
  pencil: 'pen-new-square',
  phone: 'phone',
  plus: 'add-circle',
  'question-circle': 'question-circle',
  scale: 'justice-scale',
  shield: 'shield-check',
  shirt: 't-shirt',
  smartphone: 'smartphone',
  star: 'star',
  sun: 'sun',
  ticket: 'ticket',
  translate: 'translate',
  trash: 'trash-bin-trash',
  user: 'user',
  'user-circle': 'user-circle',
  'user-plus': 'user-plus-rounded',
  users: 'users-group-rounded',
  walking: 'walking',
  'wifi-off': 'wi-fi-off',
};

interface IconPath {
  d: string;
  mode: 'fill' | 'stroke';
  opacity?: number;
  width?: number;
  cap?: string;
  join?: string;
  fillRule?: string;
}

type Paint = Readonly<Record<string, string>>;

const PAINT_ATTRIBUTES = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'fill-rule',
] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function svgFile(name: string, weight: string): string {
  return resolve(SVG_DIR, `${name}.${weight}.svg`);
}

function attributesOf(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    const [, key, value] = match;
    if (key !== undefined && value !== undefined) attributes[key] = value;
  }
  return attributes;
}

/** A circle or an ellipse as two arcs, so the app only ever draws paths. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${rx * 2},0a${rx},${ry} 0 1,0 ${-rx * 2},0Z`;
}

function numberOf(attributes: Record<string, string>, key: string, file: string): number {
  const value = Number(attributes[key] ?? 0);
  if (Number.isNaN(value)) fail(`${file}: ${key} is not a number`);
  return value;
}

/** One SVG file as the paths the app draws, with every rule that can be checked, checked. */
function parse(file: string, label: string): IconPath[] {
  const body = readFileSync(file, 'utf8');
  if (/#[0-9a-fA-F]{3,8}\b/.test(body)) {
    fail(
      `${label} carries a literal colour. The caller colours an icon, so every paint is currentColor or none.`,
    );
  }

  const raw: { d: string; paint: Paint }[] = [];
  const inherited: Paint[] = [{}];
  let sawRoot = false;
  for (const tag of body.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    const [, closing, name, attributeSource, selfClosing] = tag;
    if (name === undefined) continue;
    if (closing === '/') {
      if (name === 'g') inherited.pop();
      continue;
    }
    const attributes = attributesOf(attributeSource ?? '');
    if (name === 'svg') {
      sawRoot = true;
      if (attributes['viewBox'] !== VIEW_BOX) {
        fail(`${label} is drawn on "${attributes['viewBox']}", and the set is on "${VIEW_BOX}".`);
      }
      continue;
    }
    const paint: Record<string, string> = { ...inherited[inherited.length - 1] };
    for (const key of PAINT_ATTRIBUTES) {
      const value = attributes[key];
      if (value !== undefined) paint[key] = value;
    }
    if (name === 'g') {
      if (selfClosing !== '/') inherited.push(paint);
    } else if (name === 'path') {
      const d = attributes['d'];
      if (d === undefined) fail(`${label} has a path without data.`);
      raw.push({ d, paint });
    } else if (name === 'circle') {
      const r = numberOf(attributes, 'r', label);
      raw.push({
        d: ellipsePath(numberOf(attributes, 'cx', label), numberOf(attributes, 'cy', label), r, r),
        paint,
      });
    } else if (name === 'ellipse') {
      raw.push({
        d: ellipsePath(
          numberOf(attributes, 'cx', label),
          numberOf(attributes, 'cy', label),
          numberOf(attributes, 'rx', label),
          numberOf(attributes, 'ry', label),
        ),
        paint,
      });
    } else {
      fail(
        `${label} uses <${name}>. Paths, circles and ellipses are read; anything else is turned into a path before it enters the folder.`,
      );
    }
  }
  if (!sawRoot || raw.length === 0) fail(`${label} has nothing to draw.`);

  return raw.map(({ d, paint }) => {
    const isStroked = (paint['stroke'] ?? 'none') !== 'none';
    const entry: IconPath = { d, mode: isStroked ? 'stroke' : 'fill' };
    if (isStroked) {
      entry.width = Number(paint['stroke-width'] ?? 1);
      if (paint['stroke-linecap'] !== undefined) entry.cap = paint['stroke-linecap'];
      if (paint['stroke-linejoin'] !== undefined) entry.join = paint['stroke-linejoin'];
    } else {
      if (paint['fill'] !== 'currentColor') {
        fail(`${label} fills with "${paint['fill']}"; only currentColor can be coloured.`);
      }
      if (paint['fill-rule'] !== undefined) entry.fillRule = paint['fill-rule'];
    }
    if (paint['opacity'] !== undefined) entry.opacity = Number(paint['opacity']);
    return entry;
  });
}

/** Refills the folder from the set. Run for a new icon; the files are committed. */
async function fetchIcons(only: readonly string[]): Promise<void> {
  const unknown = only.filter((name) => !(name in ICONS));
  if (unknown.length > 0) fail(`not in ICONS: ${unknown.join(', ')}`);
  mkdirSync(SVG_DIR, { recursive: true });
  let written = 0;
  for (const [name, source] of Object.entries(ICONS)) {
    if (only.length > 0 && !only.includes(name)) continue;
    for (const [weight, suffix] of Object.entries(WEIGHTS)) {
      const url = `https://api.iconify.design/solar/${source}-${suffix}.svg`;
      const response = await fetch(url, { headers: { 'User-Agent': 'icons-fetch' } });
      // A short pause between requests, so a long list is not refused.
      await new Promise((done) => setTimeout(done, FETCH_PAUSE_MS));
      const body = await response.text();
      if (!response.ok || !body.includes('<svg')) fail(`${url} did not return an SVG`);
      writeFileSync(svgFile(name, weight), body);
      written += 1;
    }
  }
  console.log(`fetched ${written} files into docs/design/icons/svg`);
}

function build(): Record<string, Record<string, IconPath[]>> {
  if (!existsSync(SVG_DIR)) fail('no icon folder at docs/design/icons/svg; run icons:fetch first');
  const icons: Record<string, Record<string, IconPath[]>> = {};
  for (const name of Object.keys(ICONS).sort()) {
    const weights: Record<string, IconPath[]> = {};
    for (const weight of Object.keys(WEIGHTS)) {
      const file = svgFile(name, weight);
      if (!existsSync(file)) {
        fail(`${name} is missing its ${weight} weight. Every icon has both.`);
      }
      weights[weight] = parse(file, `${name}.${weight}.svg`);
    }
    // A two-tone weight with no dimmed layer is the bold weight under another name.
    const duotone = weights['boldDuotone'] ?? [];
    if (duotone.length > 1 && !duotone.some((path) => path.opacity !== undefined)) {
      fail(`${name}.boldDuotone.svg has no dimmed layer.`);
    }
    icons[name] = weights;
  }
  return icons;
}

function moduleSource(icons: Record<string, Record<string, IconPath[]>>): string {
  const names = Object.keys(icons).sort();
  const weights = Object.keys(WEIGHTS).sort();
  return `// GENERATED from docs/design/icons/svg by scripts/generate-icons.ts.
// Do not edit by hand: run \`bun run icons:gen\`.
//
// ${LICENCE.credit}
// ${LICENCE.url}
//
// This is path data. components/icons/icon.tsx draws it.

/** Every icon is drawn on this square, so one \`size\` is enough. */
export const ICON_GRID = ${GRID};

/**
 * The credit the licence asks the app to show. It travels as data, so the
 * screen that shows it follows the set that is in the folder.
 */
export const ICON_LICENCE = ${JSON.stringify(LICENCE, null, 2)} as const;

export interface IconPath {
  readonly d: string;
  readonly mode: 'fill' | 'stroke';
  readonly opacity?: number;
  readonly width?: number;
  readonly cap?: 'butt' | 'round' | 'square';
  readonly join?: 'bevel' | 'miter' | 'round';
  readonly fillRule?: 'evenodd' | 'nonzero';
}

export const ICONS = ${JSON.stringify(icons, null, 2)} as const satisfies Record<
  string,
  Record<string, readonly IconPath[]>
>;

/** What a screen may ask for. A new name means a new SVG file, and no screen changes. */
export type IconName = keyof typeof ICONS;

/** \`linear\` is the working weight; \`boldDuotone\` is for an icon that is the subject. */
export type IconWeight = ${weights.map((weight) => `'${weight}'`).join(' | ')};

export const ICON_NAMES = ${JSON.stringify(names)} as const satisfies readonly IconName[];

/** One icon as a plain list of paths, whatever fields that icon happens to use. */
export function iconPaths(name: IconName, weight: IconWeight): readonly IconPath[] {
  return ICONS[name][weight];
}
`;
}

const args = process.argv.slice(2);
if (args.includes('--fetch')) {
  await fetchIcons(args.filter((argument) => !argument.startsWith('-')));
}

const icons = build();
const prettierConfig = await resolveConfig(OUT);
const formatted = await format(moduleSource(icons), { ...prettierConfig, parser: 'typescript' });
const pathCount = Object.values(icons)
  .flatMap((weights) => Object.values(weights))
  .reduce((total, paths) => total + paths.length, 0);
const summary = `${Object.keys(icons).length} icons x ${Object.keys(WEIGHTS).length} weights, ${pathCount} paths`;

if (args.includes('--check')) {
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== formatted) {
    fail('icon-set.ts no longer matches docs/design/icons/svg. Run `bun run icons:gen`.');
  }
  console.log(`the icon set matches its source (${summary})`);
} else {
  mkdirSync(resolve(OUT, '..'), { recursive: true });
  writeFileSync(OUT, formatted);
  console.log(`wrote apps/mobile/src/components/icons/icon-set.ts (${summary})`);
}
