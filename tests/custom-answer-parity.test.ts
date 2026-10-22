/**
 * One answer check per question type, in two languages (RAPP-610): the shared
 * Zod schema her phone and the admin use (`customAnswerSchema`) and the
 * database function that saves the answer (`private.custom_answer_value_valid`).
 * Every case below goes through both, and both must give the same verdict.
 *
 * It needs the isolated database: it runs only when `RAMASSA_QA_DB_CONTAINER`
 * names a running container (`source iso-sandbox/sbx-vars.sh`), and skips in
 * CI, where there is none.
 */
import { execFileSync } from 'node:child_process';
import { expect, test } from 'bun:test';
import {
  customAnswerSchema,
  type CustomQuestionType,
  type QuestionSettings,
} from '@ramassa/shared/intake-builder';

const LIVE = ['5eed0000-0000-4000-8046-00000000000a', '5eed0000-0000-4000-8046-00000000000b'];
const ORG = '5eed0000-0000-4000-8000-000000000000';
const HER = '5eed0000-0000-4000-8000-000000000011';
const KEY = `${ORG}/intake-answers/${HER}/2026/10/${'a'.repeat(32)}`;

const yearsAgo = (years: number, extraDays = 0) => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - extraDays);
  return date.toISOString().slice(0, 10);
};

type Case = readonly [CustomQuestionType, QuestionSettings, unknown];
const file = (extension: string, contentType: string, extra: Record<string, unknown> = {}) => ({
  key: `${KEY}.${extension}`,
  name: `informe.${extension}`,
  content_type: contentType,
  size: 2048,
  ...extra,
});

const CASES: readonly Case[] = [
  ['short_text', {}, 'Hola'],
  ['short_text', {}, '   '],
  ['short_text', {}, 'x'.repeat(501)],
  ['short_text', {}, 3],
  ['long_text', {}, 'x'.repeat(4000)],
  ['long_text', {}, 'x'.repeat(4001)],
  ['yes_no_maybe', {}, 'maybe'],
  ['yes_no_maybe', {}, 'sí'],
  ['yes_no', {}, 'no'],
  ['yes_no', {}, 'maybe'],
  ['single_choice', {}, LIVE[0]],
  ['single_choice', {}, '5eed0000-0000-4000-8046-0000000000ff'],
  ['search_choice', {}, LIVE[1]],
  ['search_choice', {}, [LIVE[1]]],
  ['multiple_choice', {}, LIVE],
  ['multiple_choice', {}, [LIVE[0], LIVE[0]]],
  ['multiple_choice', {}, []],
  ['multiple_choice', {}, [1]],
  ['number', { integer: true }, 3],
  ['number', { integer: true }, 3.5],
  ['number', { integer: false }, 3.5],
  ['number', { integer: false, min: 1, max: 10 }, 0.5],
  ['number', { integer: false, min: 1, max: 10 }, 10],
  ['number', { integer: false, min: 1, max: 10 }, 10.01],
  ['number', { integer: false }, 2_000_000_000],
  ['number', { integer: false }, '3'],
  ['date', {}, '2001-02-28'],
  ['date', {}, '2001-02-29'],
  ['date', {}, '2000-02-29'],
  ['date', {}, '1899-12-31'],
  ['date', {}, '2001-2-28'],
  ['date', { min_age: 16 }, yearsAgo(16, 2)],
  ['date', { min_age: 16 }, yearsAgo(15, 300)],
  ['date', { max_age: 30 }, yearsAgo(30, 2)],
  ['date', { max_age: 30 }, yearsAgo(31, 2)],
  ['phone', {}, '+34600111222'],
  ['phone', {}, '+0600111222'],
  ['phone', {}, '+34 600 111 222'],
  ['phone', {}, '+3460011'],
  ['email', {}, 'ana@example.org'],
  ['email', {}, 'ana@example'],
  ['email', {}, 'ana@@example.org'],
  ['email', {}, 'an a@example.org'],
  ['email', {}, `${'a'.repeat(250)}@b.cd`],
  ['item_list', { max_items: 2 }, ['A', 'B']],
  ['item_list', { max_items: 2 }, ['A', 'B', 'C']],
  ['item_list', { max_items: 2 }, ['A', 'A']],
  ['item_list', { max_items: 2 }, [' A']],
  ['item_list', { max_items: 2 }, ['']],
  ['item_list', { max_items: 2 }, ['x'.repeat(121)]],
  ['item_list', { max_items: 2 }, []],
  ['consent', { text: { ca: 'Accepto' } }, true],
  ['consent', { text: { ca: 'Accepto' } }, false],
  ['consent', { text: { ca: 'Accepto' } }, 'true'],
  ['file_upload', { accept: 'document' }, file('pdf', 'application/pdf')],
  ['file_upload', { accept: 'photo' }, file('pdf', 'application/pdf')],
  ['file_upload', { accept: 'photo' }, file('jpg', 'image/jpeg')],
  ['file_upload', { accept: 'document' }, file('docx', 'application/msword')],
  ['file_upload', { accept: 'document' }, file('pdf', 'application/pdf', { size: 0 })],
  ['file_upload', { accept: 'document' }, file('pdf', 'application/pdf', { size: 20_000_000 })],
  ['file_upload', { accept: 'document' }, file('pdf', 'application/pdf', { extra: 1 })],
  [
    'file_upload',
    { accept: 'document' },
    {
      ...file('pdf', 'application/pdf'),
      key: `${ORG}/gallery/${HER}/2026/10/${'a'.repeat(32)}.pdf`,
    },
  ],
  [
    'signature',
    {},
    [
      [
        [0, 0],
        [1000, 1000],
      ],
    ],
  ],
  ['signature', {}, [[[0, 1001]]]],
  ['signature', {}, [[[0.5, 3]]]],
  ['signature', {}, []],
  ['signature', {}, [[]]],
];

function container(): string | null {
  const name = process.env.RAMASSA_QA_DB_CONTAINER;
  if (name === undefined || name === '') return null;
  try {
    const running = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' });
    return running.split('\n').includes(name) ? name : null;
  } catch {
    return null;
  }
}

const database = container();
const sqlText = (value: unknown) => `'${JSON.stringify(value).replaceAll("'", "''")}'`;

test.skipIf(database === null)(
  'the database refuses and accepts exactly what the shared schema does, for every type',
  () => {
    const rows = CASES.map(
      ([type, settings, value], index) =>
        `(${index}, '${type}', ${sqlText(settings)}::jsonb, ${sqlText(value)}::jsonb)`,
    ).join(',\n');
    const sql = `select string_agg(
        case when private.custom_answer_value_valid(c.type, c.settings, c.value,
                    array['${LIVE.join("','")}']) then 't' else 'f' end, '' order by c.n)
      from (values ${rows}) as c(n, type, settings, value);`;
    const fromDatabase = execFileSync(
      'docker',
      ['exec', database!, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
      { encoding: 'utf8' },
    ).trim();
    const fromSchema = CASES.map(([type, settings, value]) =>
      customAnswerSchema({
        type,
        settings,
        options: LIVE.map((id) => ({ id, isArchived: false })),
      }).safeParse(value).success
        ? 't'
        : 'f',
    ).join('');
    const differing = CASES.flatMap(([type, , value], index) =>
      fromDatabase[index] === fromSchema[index]
        ? []
        : [
            `${type} ${JSON.stringify(value).slice(0, 60)}: db ${fromDatabase[index]} zod ${fromSchema[index]}`,
          ],
    );
    expect(differing).toEqual([]);
    // Both sides accept and refuse something of every type.
    expect(fromSchema).toContain('t');
    expect(fromSchema).toContain('f');
  },
  30_000,
);

test.skipIf(database !== null)('answer parity skipped: no isolated database container', () => {
  expect(database).toBeNull();
});
