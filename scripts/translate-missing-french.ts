/**
 * One-time French backfill (RAPP-781): fills the French of the content that
 * existed before French, through the translation Worker the Control Center's
 * "Tradueix" button uses. Re-runnable and idempotent.
 *
 *   bun run content:translate-french -- --dry-run
 *   bun run content:translate-french
 *   bun run content:translate-french -- --only=announcements,events
 *
 * Environment:
 *   DATABASE_URL               the Postgres connection string of the project to
 *                              fill (Supabase: Connect, session pooler); it
 *                              reads and writes every organization's content
 *   TRANSLATION_WORKER_URL     the Worker, as EXPO_PUBLIC_TRANSLATION_WORKER_URL
 *   TRANSLATION_ACCESS_TOKEN   a team member's session token, second factor
 *                              verified (the Worker asks for one); not needed
 *                              with --dry-run
 *
 * The rules, per text in a language record ({ ca, es, en, ar, fa }):
 *   - a text that already has French keeps it, whatever it says;
 *   - only French is written: no other language is ever changed;
 *   - French is filled only where every other language is written. A text
 *     written in Catalan only follows its fallback in Spanish too, so it does
 *     in French as well;
 *   - a Catalan left blank on purpose ('') gets a blank French, no translation;
 *   - a knowledge body is translated block by block, keeping its blocks.
 *
 * Published legal versions (app terms, season authorizations, the versions of
 * the team forms) are frozen snapshots of what players signed and are never
 * touched. Their live form rows are filled, so the next published version
 * carries French; the run counts the snapshots it left alone.
 */

import { SQL } from 'bun';
import { AppError } from '../packages/shared/errors';
import { requestTranslationDrafts } from '../packages/shared/translation/client';
import { MAX_TRANSLATION_TEXT_LENGTH } from '../packages/shared/translation/index';

const SOURCE_LANGUAGE = 'ca';
const FRENCH = 'fr';
const LANGUAGES = ['ca', 'es', 'en', 'fr', 'ar', 'fa'] as const;
const OTHER_LANGUAGES = ['es', 'en', 'ar', 'fa'] as const;
/** The text fields of a knowledge block; its image address stays as it is. */
const BLOCK_TEXT_FIELDS = ['title', 'text', 'imageAlt'] as const;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

interface FillCounts {
  /** Texts that got a machine French. */
  translated: number;
  /** Catalan left blank on purpose, so French is blank too. */
  blank: number;
  /** Texts not written in every other language: French keeps following its fallback. */
  incomplete: number;
  /** Texts too long for one translation request. */
  tooLong: number;
}

export const emptyCounts = (): FillCounts => ({
  translated: 0,
  blank: 0,
  incomplete: 0,
  tooLong: 0,
});

export type Translate = (catalan: string) => Promise<string>;

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A record keyed by language: Catalan is there and every key is a supported language. */
function isLanguageRecord(value: JsonObject): boolean {
  const keys = Object.keys(value);
  return (
    keys.includes(SOURCE_LANGUAGE) &&
    keys.every((key) => (LANGUAGES as readonly string[]).includes(key))
  );
}

async function frenchOf(catalan: string, translate: Translate, counts: FillCounts) {
  if (catalan.trim() === '') {
    counts.blank += 1;
    return '';
  }
  if (catalan.length > MAX_TRANSLATION_TEXT_LENGTH) {
    counts.tooLong += 1;
    return undefined;
  }
  counts.translated += 1;
  return translate(catalan);
}

async function frenchBlocks(
  blocks: Json[],
  translate: Translate,
  counts: FillCounts,
): Promise<Json[] | undefined> {
  const translated: Json[] = [];
  for (const block of blocks) {
    if (!isObject(block)) return undefined;
    const copy: JsonObject = { ...block };
    for (const field of BLOCK_TEXT_FIELDS) {
      const text = block[field];
      if (typeof text !== 'string' || text.trim() === '') continue;
      const french = await frenchOf(text, translate, counts);
      if (french === undefined) return undefined;
      copy[field] = french;
    }
    translated.push(copy);
  }
  return translated;
}

async function fillRecord(
  record: JsonObject,
  translate: Translate,
  counts: FillCounts,
): Promise<JsonObject> {
  if (FRENCH in record) return record;
  const catalan = record[SOURCE_LANGUAGE];
  if (typeof catalan === 'string') {
    if (!OTHER_LANGUAGES.every((language) => typeof record[language] === 'string')) {
      counts.incomplete += 1;
      return record;
    }
    const french = await frenchOf(catalan, translate, counts);
    return french === undefined ? record : { ...record, [FRENCH]: french };
  }
  if (Array.isArray(catalan)) {
    if (!OTHER_LANGUAGES.every((language) => Array.isArray(record[language]))) {
      counts.incomplete += 1;
      return record;
    }
    const french = await frenchBlocks(catalan, translate, counts);
    return french === undefined ? record : { ...record, [FRENCH]: french };
  }
  return record;
}

/**
 * The value with French filled into every language record inside it, by the
 * rules above. Returns the same value, untouched, when nothing was filled.
 */
export async function fillFrench(value: Json, translate: Translate, counts: FillCounts) {
  const filled = await walk(value, translate, counts);
  return { value: filled, changed: JSON.stringify(filled) !== JSON.stringify(value) };
}

async function walk(value: Json, translate: Translate, counts: FillCounts): Promise<Json> {
  if (Array.isArray(value)) {
    const items: Json[] = [];
    for (const item of value) items.push(await walk(item, translate, counts));
    return items;
  }
  if (!isObject(value)) return value;
  if (isLanguageRecord(value)) return fillRecord(value, translate, counts);
  const entries: [string, Json][] = [];
  for (const [key, item] of Object.entries(value)) {
    entries.push([key, await walk(item, translate, counts)]);
  }
  return Object.fromEntries(entries);
}

/** One content type: a table, its key, and the columns that hold language records. */
interface ContentSource {
  readonly table: string;
  readonly key: readonly string[];
  readonly columns: readonly string[];
}

export const CONTENT_SOURCES: readonly ContentSource[] = [
  {
    table: 'announcements',
    key: ['id'],
    columns: ['title', 'body', 'image_alt'],
  },
  { table: 'event_categories', key: ['id'], columns: ['name'] },
  { table: 'events', key: ['id'], columns: ['title', 'description'] },
  { table: 'knowledge_categories', key: ['id'], columns: ['name'] },
  { table: 'knowledge_articles', key: ['id'], columns: ['title', 'body'] },
  {
    table: 'service_categories',
    key: ['id'],
    columns: ['name', 'metadata_schema'],
  },
  { table: 'services', key: ['id'], columns: ['title', 'description'] },
  { table: 'service_images', key: ['id'], columns: ['alt_text'] },
  { table: 'forum_categories', key: ['id'], columns: ['name'] },
  { table: 'notification_templates', key: ['id'], columns: ['title', 'body'] },
  { table: 'surveys', key: ['id'], columns: ['title'] },
  { table: 'survey_questions', key: ['id'], columns: ['prompt', 'options'] },
  { table: 'equipment_item_types', key: ['id'], columns: ['name'] },
  {
    table: 'organizations',
    key: ['id'],
    columns: ['document_step_explanation'],
  },
  { table: 'profile_sections', key: ['id'], columns: ['title'] },
  {
    table: 'profile_fields',
    key: ['id'],
    columns: ['label', 'help', 'settings'],
  },
  { table: 'custom_question_options', key: ['id'], columns: ['label'] },
  {
    table: 'field_placements',
    key: ['id'],
    columns: ['label_override', 'help_override'],
  },
  {
    table: 'intake_screens',
    key: ['id'],
    columns: ['title', 'intro', 'texts'],
  },
  {
    table: 'intake_builtin_screens',
    key: ['org_id', 'screen'],
    columns: ['texts'],
  },
  { table: 'custom_forms', key: ['id'], columns: ['name'] },
  {
    table: 'custom_form_screens',
    key: ['id'],
    columns: ['title', 'intro', 'texts', 'attachments'],
  },
  {
    table: 'form_blocks',
    key: ['id'],
    columns: ['title', 'body', 'points', 'settings'],
  },
  { table: 'consents', key: ['id'], columns: ['name', 'body'] },
  { table: 'consent_placements', key: ['id'], columns: ['body_override'] },
];

/** The frozen snapshots of published legal versions: counted, never written. */
export const FROZEN_SOURCES = [
  'app_terms_versions',
  'authorization_versions',
  'custom_form_versions',
] as const;

interface Options {
  readonly dryRun: boolean;
  readonly only: ReadonlySet<string> | null;
}

function parseOptions(argv: readonly string[]): Options {
  const only = argv.find((argument) => argument.startsWith('--only='));
  return {
    dryRun: argv.includes('--dry-run'),
    only: only === undefined ? null : new Set(only.slice('--only='.length).split(',')),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    console.error(`${name} must be set.`);
    process.exit(1);
  }
  return value.trim();
}

// The Worker allows 20 requests a minute per team member.
const REQUEST_SPACING_MS = Number(process.env.FRENCH_BACKFILL_SPACING_MS ?? 3_200);
const RATE_LIMIT_PAUSE_MS = 60_000;

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Table and column names come from the lists above, never from input. */
function quoted(name: string): string {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`unexpected name ${name}`);
  return `"${name}"`;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const database = new SQL(requiredEnv('DATABASE_URL'));
  const workerUrl = options.dryRun ? undefined : requiredEnv('TRANSLATION_WORKER_URL');
  const accessToken = options.dryRun ? undefined : requiredEnv('TRANSLATION_ACCESS_TOKEN');

  const cache = new Map<string, string>();
  let lastRequestAt = 0;
  const translate: Translate = async (catalan) => {
    if (options.dryRun) return `[fr] ${catalan}`;
    const cached = cache.get(catalan);
    if (cached !== undefined) return cached;
    for (;;) {
      await sleep(Math.max(0, lastRequestAt + REQUEST_SPACING_MS - Date.now()));
      lastRequestAt = Date.now();
      try {
        const review = await requestTranslationDrafts({
          workerUrl,
          accessToken,
          text: catalan,
          from: 'ca',
          to: ['fr'],
        });
        const french = review.suggestions.find((suggestion) => suggestion.language === 'fr');
        if (french === undefined) throw new AppError('TRANSLATION-2');
        cache.set(catalan, french.machineText);
        return french.machineText;
      } catch (thrown) {
        if (thrown instanceof AppError && thrown.code === 'TRANSLATION-3') {
          await sleep(RATE_LIMIT_PAUSE_MS);
          continue;
        }
        throw thrown;
      }
    }
  };

  console.log(options.dryRun ? 'Dry run: nothing is written.' : 'Filling French.');
  for (const source of CONTENT_SOURCES) {
    if (options.only !== null && !options.only.has(source.table)) continue;
    const counts = emptyCounts();
    let changedRows = 0;
    let movedOn = 0;
    const table = `public.${quoted(source.table)}`;
    const columns = source.columns.map(quoted);
    const key = source.key.map(quoted);
    const keyList = key.map((column, index) => `${column}::text as k${index}`).join(', ');
    const columnList = columns.map((column, index) => `${column} as c${index}`).join(', ');
    const rows = (await database.unsafe(
      `select ${keyList}, ${columnList} from ${table} order by ${key.join(', ')}`,
    )) as JsonObject[];
    for (const row of rows) {
      const patch: { readonly index: number; readonly before: Json; readonly after: Json }[] = [];
      for (const [index] of source.columns.entries()) {
        const before = row[`c${index}`] ?? null;
        const filled = await fillFrench(before, translate, counts);
        if (filled.changed) patch.push({ index, before, after: filled.value });
      }
      if (patch.length === 0) continue;
      changedRows += 1;
      if (options.dryRun) continue;
      // Only the columns read are written, and only while they still read the
      // same: a row edited during the run is left for the next run.
      const values: string[] = [];
      const parameter = (value: string) => {
        values.push(value);
        return `$${values.length}`;
      };
      const sets = patch.map(
        (change) =>
          `${columns[change.index]} = ${parameter(JSON.stringify(change.after))}::text::jsonb`,
      );
      const matches = [
        ...key.map((column, index) => `${column}::text = ${parameter(String(row[`k${index}`]))}`),
        ...patch.map(
          (change) =>
            `${columns[change.index]} is not distinct from ` +
            `${parameter(JSON.stringify(change.before))}::text::jsonb`,
        ),
      ];
      const written = (await database.unsafe(
        `update ${table} set ${sets.join(', ')} where ${matches.join(' and ')} returning 1`,
        values,
      )) as unknown[];
      if (written.length === 0) movedOn += 1;
    }
    console.log(
      `${source.table}: ${rows.length} rows, ${changedRows} ${options.dryRun ? 'to fill' : 'filled'}` +
        `, ${counts.translated} texts translated, ${counts.blank} blank` +
        `, ${counts.incomplete} not in every language (left to their fallback)` +
        `, ${counts.tooLong} too long` +
        (movedOn > 0 ? `, ${movedOn} changed during the run (run again)` : ''),
    );
  }

  for (const frozen of FROZEN_SOURCES) {
    const [count] = (await database.unsafe(
      `select count(*)::int as total from public.${quoted(frozen)}`,
    )) as { total: number }[];
    console.log(
      `${frozen}: ${count?.total ?? 0} published versions left as signed (never touched)`,
    );
  }
  await database.close();
}

if (import.meta.main) {
  await main();
}
