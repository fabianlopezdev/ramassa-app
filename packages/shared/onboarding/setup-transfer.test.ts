/**
 * The onboarding setup file (RAPP-621): one versioned document, read with
 * the same schema in the admin before it reaches the database, which checks
 * it again. An unknown version or a damaged file is named, never guessed.
 */
import { describe, expect, test } from 'bun:test';
import { buildAppTermsVersion, buildAuthorizationVersion } from '../testing';
import {
  exportOnboardingSetup,
  importOnboardingSetup,
  onboardingSetupFileName,
  previewOnboardingSetupImport,
  readOnboardingSetupFile,
} from './setup-transfer';

const SCREEN = '5eed0000-0000-4000-8044-000000000001';
const GATE = '5eed0000-0000-4000-8045-000000000001';
const CHILD = '5eed0000-0000-4000-8045-000000000002';
const OPTION = '5eed0000-0000-4000-8046-000000000001';
const SEASON = '5eed0000-0000-4000-8040-000000000001';

function document(overrides: Record<string, unknown> = {}) {
  return {
    format: 'ramassa.onboarding-setup',
    schema_version: 1,
    app_commit: 'abc1234',
    exported_at: '2026-10-22T10:00:00.000000+00:00',
    screens: [
      {
        id: SCREEN,
        title: { ca: 'Més sobre tu' },
        intro: null,
        after_screen: 'logistics',
        sort_order: 0,
        home_after_screen: 'logistics',
        home_sort_order: 0,
        is_archived: false,
        questions: [
          {
            id: GATE,
            question_type: 'single_choice',
            label: { ca: 'Tens fills?' },
            help: null,
            privacy: 'personal',
            placements: ['wizard'],
            settings: {},
            is_required: true,
            sort_order: 0,
            is_archived: false,
            show_when_question_id: null,
            show_when_option_id: null,
            options: [{ id: OPTION, label: { ca: 'Sí' }, sort_order: 0, is_archived: false }],
          },
          {
            id: CHILD,
            question_type: 'number',
            label: { ca: 'Quants?' },
            help: { es: 'Número' },
            privacy: 'personal',
            placements: ['wizard'],
            settings: { integer: true, min: 1 },
            is_required: false,
            sort_order: 1,
            is_archived: false,
            show_when_question_id: GATE,
            show_when_option_id: OPTION,
            options: [],
          },
        ],
      },
    ],
    builtin_question_overrides: [
      {
        question: 'phone',
        label: null,
        help: { ca: 'Mòbil' },
        is_hidden: false,
        option_overrides: {},
      },
    ],
    builtin_screens: [{ screen: 'equipment', texts: {}, is_hidden: true }],
    flow_order: ['identity', `custom:${SCREEN}`, 'logistics'],
    required_questions: [{ question: 'phone', is_required: true }],
    presets: [{ name: 'Derivada', states: { phone: 'skip' } }],
    document_step_explanation: { ca: 'Porta el document.' },
    app_terms: {
      published: [
        {
          version_number: 1,
          published_at: '2026-10-01T10:00:00+00:00',
          content: buildAppTermsVersion().content,
        },
      ],
      draft: null,
    },
    seasons: [{ id: SEASON, name: '2026/27', starts_on: '2026-09-01', is_current: true }],
    authorization: {
      published: [
        {
          season_id: SEASON,
          version_number: 1,
          published_at: '2026-09-01T10:00:00+00:00',
          content: buildAuthorizationVersion().content,
        },
      ],
      draft: null,
    },
    ...overrides,
  };
}

const asFile = (value: unknown) => JSON.stringify(value);

describe('reading a setup file', () => {
  test('an export is read, with its counts', () => {
    const read = readOnboardingSetupFile(asFile(document()));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.document.screens[0]?.questions).toHaveLength(2);
    expect(read.document.app_commit).toBe('abc1234');
  });

  test('a file that is not JSON or not an export says so', () => {
    expect(readOnboardingSetupFile('not json')).toEqual({ ok: false, reason: 'not_setup' });
    expect(readOnboardingSetupFile(asFile({ format: 'other' }))).toEqual({
      ok: false,
      reason: 'not_setup',
    });
  });

  test('an unknown schema version is refused by number', () => {
    expect(readOnboardingSetupFile(asFile(document({ schema_version: 2 })))).toEqual({
      ok: false,
      reason: 'unknown_version',
      version: 2,
    });
  });

  test('a damaged export is refused', () => {
    const broken = document();
    (broken.screens[0] as Record<string, unknown>).questions = 'none';
    expect(readOnboardingSetupFile(asFile(broken))).toMatchObject({ ok: false, reason: 'damaged' });
  });

  test('every reference must point inside the file', () => {
    expect(
      readOnboardingSetupFile(
        asFile(document({ flow_order: ['custom:5eed0000-0000-4000-8044-0000000000ff'] })),
      ),
    ).toMatchObject({ ok: false, reason: 'damaged' });
    const lost = document();
    lost.seasons = [];
    expect(readOnboardingSetupFile(asFile(lost))).toMatchObject({ ok: false, reason: 'damaged' });
    const orphan = document();
    const child = orphan.screens[0]!.questions[1] as Record<string, unknown>;
    child.show_when_option_id = '5eed0000-0000-4000-8046-0000000000ff';
    expect(readOnboardingSetupFile(asFile(orphan))).toMatchObject({ ok: false, reason: 'damaged' });
  });

  test('no person travels: a key about people makes the file damaged', () => {
    const withPeople = { ...document(), test_players: [{ email: 'joana@example.test' }] };
    expect(readOnboardingSetupFile(asFile(withPeople))).toMatchObject({
      ok: false,
      reason: 'damaged',
    });
  });

  test('the file name carries the date', () => {
    expect(onboardingSetupFileName(new Date('2026-10-22T10:00:00Z'))).toBe(
      'ramassa-onboarding-setup-2026-10-22.json',
    );
  });
});

describe('the database calls', () => {
  function clientReturning(data: unknown, error: unknown = null) {
    const calls: unknown[] = [];
    const client = {
      rpc: (name: string, args?: unknown) => {
        calls.push([name, args]);
        return Promise.resolve({ data, error });
      },
    };
    return { client: client as never, calls };
  }

  test('export sends the app commit and checks what it gets back', async () => {
    const { client, calls } = clientReturning(document());
    const exported = await exportOnboardingSetup(client, 'abc1234');
    expect(exported.schema_version).toBe(1);
    expect(calls).toEqual([['export_onboarding_setup', { p_app_commit: 'abc1234' }]]);
  });

  test('the preview is parsed: counts, blockers, warnings and the legal drafts', async () => {
    const { client, calls } = clientReturning({
      can_import: false,
      blockers: ['screens'],
      problem: null,
      schema_version: 1,
      app_commit: 'abc1234',
      exported_at: '2026-10-22T10:00:00+00:00',
      counts: { screens: 1, questions: 2 },
      warnings: [{ code: 'legal_drafts' }, { code: 'attachment_links', hosts: ['example.org'] }],
      legal: {
        app_terms: { source: 'bundled', imported: false },
        authorization: {
          source: 'published',
          version_number: 1,
          season_name: '2026/27',
          imported: true,
        },
      },
    });
    const raw = document();
    const preview = await previewOnboardingSetupImport(client, raw);
    expect(preview.canImport).toBe(false);
    expect(preview.blockers).toEqual(['screens']);
    expect(preview.counts.questions).toBe(2);
    expect(preview.warnings[1]).toEqual({ code: 'attachment_links', hosts: ['example.org'] });
    expect(preview.legal.authorization.imported).toBe(true);
    // The file as read, never a re-serialised copy.
    expect(calls).toEqual([['preview_onboarding_setup_import', { p_document: raw }]]);
  });

  test('the import returns its report; a refusal is a typed error', async () => {
    const report = await importOnboardingSetup(
      clientReturning({
        counts: { screens: 1 },
        legal: {
          app_terms: { source: 'draft', version_number: null, imported: true },
          authorization: { source: 'none', imported: false },
        },
        warnings: [{ code: 'legal_drafts' }],
      }).client,
      document(),
    );
    expect(report.legal.appTerms.imported).toBe(true);
    await expect(
      importOnboardingSetup(
        clientReturning(null, { message: 'ONBOARDING_SETUP/NOT_EMPTY: x', code: '55000' }).client,
        document(),
      ),
    ).rejects.toMatchObject({ name: 'AppError' });
  });
});
