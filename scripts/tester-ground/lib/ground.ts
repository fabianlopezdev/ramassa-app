/**
 * Tester ground (RAPP-885): the shared contract for the modules that give the
 * test players on staging a full app to try, with dummy data in every tab.
 *
 * Staging starts almost empty: one organization (`ramassa`), no season, no
 * categories and no content. So a module creates everything its tab needs,
 * categories included, and never relies on rows from `supabase/seed.sql`.
 *
 * A module returns SQL as text. The runner joins the modules in `order`,
 * replaces the image tokens and executes the result as role `postgres`, on a
 * local stack or on the linked staging project. Because of that:
 *   - every row a module creates has an id from `gid()`, so `publish()` can be
 *     run again safely and `remove()` deletes exactly what was created;
 *   - a module never disables triggers and never changes the schema.
 */

import { createHash } from 'node:crypto';

/** The six app languages, Catalan first (the organization's default). */
export const LANGS = ['ca', 'es', 'en', 'fr', 'ar', 'fa'] as const;
export type Lang = (typeof LANGS)[number];
/** One text in every app language. */
export type Translated = Readonly<Record<Lang, string>>;

/**
 * A stable uuid for a named row: the md5 of `tg:<slug>` with the version digit
 * set to 8 and the variant digit set to `a`, so it is a valid RFC 9562 uuid.
 * The app checks ids with zod's `z.uuid()`, which refuses a bare md5. Start the
 * slug with the module name (`'forum:post:welcome'`) so two modules never
 * share an id. For an id built inside SQL from other columns, use `sqlGid()`.
 */
export function gid(slug: string): string {
  const md5 = createHash('md5').update(`tg:${slug}`).digest('hex');
  const hex = `${md5.slice(0, 12)}8${md5.slice(13, 16)}a${md5.slice(17)}`;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/**
 * The same id as `gid()`, computed by Postgres from a SQL text expression that
 * yields the slug: `sqlGid("'accounts:terms:' || p.id::text")`.
 */
export function sqlGid(slugExpression: string): string {
  return `overlay(overlay(md5('tg:' || ${slugExpression}) placing '8' from 13) placing 'a' from 17)::uuid`;
}

export interface Account {
  /** Short name used in slugs: `tester:1`, `player:3`, `team:1`. */
  readonly key: string;
  /** `auth.users.id` and `profiles.id`. */
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

function account(key: string, email: string, firstName: string, lastName: string): Account {
  return { key, id: gid(key), email, firstName, lastName };
}

/**
 * The accounts people sign in with. The first four are for the people at
 * Ramassà. The fifth is the app team's own (RAPP-902), to try the ground
 * before the club does. All fictional.
 */
export const TESTERS: readonly Account[] = [
  account('tester:1', 'prova1@example.test', 'Amal', 'Prova'),
  account('tester:2', 'prova2@example.test', 'Leila', 'Prova'),
  account('tester:3', 'prova3@example.test', 'Olena', 'Prova'),
  account('tester:4', 'prova4@example.test', 'Mariama', 'Prova'),
  account('tester:5', 'prova5@example.test', 'Noor', 'Prova'),
];

/**
 * Other players, so the forum, the gallery and the stories have authors who
 * are not the testers. Nobody signs in with these. All fictional.
 */
export const COMPANIONS: readonly Account[] = [
  account('player:1', 'companya1@example.test', 'Samira', 'Haddad'),
  account('player:2', 'companya2@example.test', 'Yasmin', 'Rahimi'),
  account('player:3', 'companya3@example.test', 'Oksana', 'Bondar'),
  account('player:4', 'companya4@example.test', 'Fatou', 'Diop'),
  account('player:5', 'companya5@example.test', 'Carolina', 'Mejía'),
  account('player:6', 'companya6@example.test', 'Hawa', 'Sow'),
];

/** The team member who publishes the content and answers in the chat. Fictional. */
export const TEAM: Account = account('team:1', 'equip.prova@example.test', 'Júlia', 'Soler');

/** SQL expression for the organization every row belongs to. */
export const ORG = "(select id from public.organizations where slug = 'ramassa')";

/** A SQL literal: text is quoted and escaped, `null` becomes `null`. */
export function lit(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

/** A `jsonb` literal. */
export function jsonb(value: unknown): string {
  return `${lit(JSON.stringify(value))}::jsonb`;
}

/** A `uuid` literal for a named row: `uid('forum:post:welcome')`. */
export function uid(slug: string): string {
  return `'${gid(slug)}'::uuid`;
}

/**
 * A moment shortly before the run. What a player sees as new is what was
 * published after she joined AND after the day the tab-news migration reached
 * that database (2026-11-20 on staging). So content that has to show a number
 * or "Nou" is dated minutes before the run, never days.
 */
export function minutesAgo(minutes: number): string {
  return `(now() - interval '${minutes} minutes')`;
}

/** A moment relative to the run, for dates that are not about being new. */
export function daysFromNow(days: number, time = '18:00'): string {
  return `(date_trunc('day', now()) + interval '${days} days' + time '${time}')`;
}

/**
 * The stock images the modules can use. The prefix says where the image is
 * used, and the image store gives each prefix a storage key the app accepts
 * there. A module may leave names unused.
 */
export const IMAGE_NAMES = [
  ...numbered('gallery', 12),
  ...numbered('story', 4),
  ...numbered('activity', 6),
  ...numbered('avis', 3),
  ...numbered('service', 10),
  ...numbered('guide', 8),
  ...numbered('forum', 3),
  ...numbered('avatar', 7),
] as const;
export type ImageName = (typeof IMAGE_NAMES)[number];
export type ImageField = 'key' | 'width' | 'height' | 'bytes' | 'mime';

function numbered(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * A token the runner replaces with a SQL literal: the storage key of the image
 * (a quoted text), or one of its facts (`width`, `height` and `bytes` are
 * numbers, `mime` is a quoted text). Use it wherever a column stores a
 * storage key: `insert ... values (${img('gallery-01')}, ${img('gallery-01', 'width')})`.
 */
export function img(name: ImageName, field: ImageField = 'key'): string {
  return `{{image:${name}:${field}}}`;
}

export interface GroundModule {
  /** `accounts`, `inici`, `activitats`, `comunitat`, `ajuda`, `contacte`. */
  readonly name: string;
  /** Run order of `publish()`. Accounts are 10; `remove()` runs in reverse. */
  readonly order: number;
  /** SQL that creates this module's rows for every tester. Safe to run twice. */
  publish(): string;
  /** SQL that deletes everything `publish()` created and every row hanging from it. */
  remove(): string;
  /**
   * SQL that makes this module's things new again for one tester: what is
   * addressed to her or waits for her is put back as it was after `publish()`.
   */
  renew?(tester: Account): string;
}
