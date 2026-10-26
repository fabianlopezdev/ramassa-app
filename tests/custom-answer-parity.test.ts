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
const SIGNED: QuestionSettings = { text: { ca: 'Accepto' }, requires_signature: true };
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
  // A consent that asks for her signature (RAPP-671): the tick, her drawing and its day.
  [
    'consent',
    SIGNED,
    {
      accepted: true,
      signature: [
        [
          [0, 0],
          [1000, 1000],
        ],
      ],
    },
  ],
  ['consent', SIGNED, { accepted: true, signature: [[[1, 2]]], signed_on: '2026-10-26' }],
  ['consent', SIGNED, { accepted: true, signature: [[[1, 2]]], signed_on: '2026-02-30' }],
  ['consent', SIGNED, { accepted: true, signature: [[[0, 1001]]] }],
  ['consent', SIGNED, { accepted: true, signature: [[[0.5, 3]]] }],
  ['consent', SIGNED, { accepted: true, signature: [] }],
  ['consent', SIGNED, { accepted: false, signature: [[[1, 2]]] }],
  ['consent', SIGNED, { accepted: true, signature: [[[1, 2]]], extra: 1 }],
  ['consent', SIGNED, true],
  // Whitespace the way JavaScript's trim sees it (RAPP-610): tabs, new lines,
  // a no-break space and an ideographic space are blank, and padding is not
  // part of the answer.
  ['short_text', {}, '\t\n'],
  ['short_text', {}, ' '],
  ['short_text', {}, '\u00a0\u3000'],
  ['long_text', {}, '\n\n\n'],
  ['short_text', {}, '\u00a0Hola\u3000'],
  ['item_list', { max_items: 2 }, ['A\u00a0']],
  ['item_list', { max_items: 2 }, ['\tA']],
  // Length counts characters as she sees them (code points), so an emoji is one.
  ['short_text', {}, '😀'.repeat(500)],
  ['short_text', {}, '😀'.repeat(501)],
  ['long_text', {}, '😀'.repeat(4000)],
  ['item_list', { max_items: 2 }, ['😀'.repeat(120)]],
  ['item_list', { max_items: 2 }, ['😀'.repeat(121)]],
  [
    'file_upload',
    { accept: 'document' },
    file('pdf', 'application/pdf', { name: `${'😀'.repeat(116)}.pdf` }),
  ],
  [
    'file_upload',
    { accept: 'document' },
    file('pdf', 'application/pdf', { name: `${'😀'.repeat(117)}.pdf` }),
  ],
  ['email', {}, `${'é'.repeat(240)}@exemple.cat`],
  // A padded fixed value is not the value.
  ['yes_no_maybe', {}, ' maybe '],
  ['yes_no', {}, ' yes'],
  ['single_choice', {}, ` ${LIVE[0]}`],
  // The two lists the app ships (RAPP-660): the canonical name only.
  ['country', {}, 'Síria'],
  ['country', {}, 'Syria'],
  ['country', {}, ' Síria'],
  ['municipality', {}, 'Vic'],
  ['municipality', {}, 'Madrid'],
  ['municipality', {}, 3],
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

const CHOICE_TYPES: readonly CustomQuestionType[] = [
  'single_choice',
  'search_choice',
  'multiple_choice',
];

/**
 * The same cases through the real call her phone makes,
 * `save_my_custom_answers`, as the seeded player: an answer counts as accepted
 * when a row is stored. A blank answer removes rather than stores, which is
 * what refusing it means for her.
 */
test.skipIf(database === null)(
  'saving through save_my_custom_answers stores exactly what the shared schema accepts',
  () => {
    const cases = JSON.stringify(
      CASES.map(([type, settings, value]) => ({ type, settings, value })),
    ).replaceAll("'", "''");
    const sql = `begin;
create function pg_temp.verdicts(p_cases jsonb) returns text language plpgsql as $f$
declare
  entry jsonb;
  question uuid;
  screen uuid;
  verdicts text := '';
begin
  insert into public.intake_screens (org_id, title, after_screen)
  values ('${ORG}', '{"ca": "Paritat"}', 'logistics') returning id into screen;
  for entry in select value from jsonb_array_elements(p_cases) with ordinality as c(value, n) order by n loop
    insert into public.profile_fields (org_id, section_id, kind, question_type, label, privacy, settings)
    values ('${ORG}', (select id from public.profile_sections where org_id = '${ORG}' and key = 'support'),
            'custom', entry ->> 'type', '{"ca": "Pregunta"}', 'normal', entry -> 'settings')
    returning id into question;
    insert into public.field_placements (org_id, field_id, surface, screen_key)
    values ('${ORG}', question, 'onboarding', screen::text);
    if entry ->> 'type' in ('${CHOICE_TYPES.join("','")}') then
      insert into public.custom_question_options (id, org_id, question_id, label, sort_order)
      values ('${LIVE[0]}', '${ORG}', question, '{"ca": "A"}', 0),
             ('${LIVE[1]}', '${ORG}', question, '{"ca": "B"}', 1)
      on conflict (id) do update set question_id = excluded.question_id;
    end if;
    perform set_config('request.jwt.claims', '{"sub": "${HER}", "role": "authenticated"}', true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.save_my_custom_answers(jsonb_build_object(question::text, entry -> 'value'));
    exception when others then
      null;
    end;
    perform set_config('role', 'postgres', true);
    verdicts := verdicts || case when exists (select 1 from public.custom_answers a
                                               where a.question_id = question) then 't' else 'f' end;
  end loop;
  return verdicts;
end
$f$;
select pg_temp.verdicts('${cases}'::jsonb);
rollback;`;
    const output = execFileSync(
      'docker',
      ['exec', '-i', database!, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-q'],
      { encoding: 'utf8', input: sql },
    );
    const fromDatabase = output
      .split('\n')
      .find((line) => /^[tf]+$/.test(line.trim()))
      ?.trim();
    const fromSchema = CASES.map(([type, settings, value]) =>
      customAnswerSchema({
        type,
        settings,
        options: LIVE.map((id) => ({ id, isArchived: false })),
      }).safeParse(value).success
        ? 't'
        : 'f',
    ).join('');
    expect(fromDatabase?.length).toBe(CASES.length);
    const differing = CASES.flatMap(([type, , value], index) =>
      fromDatabase![index] === fromSchema[index]
        ? []
        : [
            `${type} ${JSON.stringify(value).slice(0, 60)}: saved ${fromDatabase![index]} zod ${fromSchema[index]}`,
          ],
    );
    expect(differing).toEqual([]);
  },
  60_000,
);

test.skipIf(database !== null)('answer parity skipped: no isolated database container', () => {
  expect(database).toBeNull();
});
