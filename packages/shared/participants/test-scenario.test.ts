import { describe, expect, test } from 'bun:test';
import { systemFieldIndexFromCatalog } from '../intake-builder/field-answers';
import { customAnswerSchema } from '../intake-builder/question-types';
import { WIZARD_QUESTIONS } from '../onboarding/question-states';
import {
  systemFieldFixtureId,
  systemFieldsCatalogFixture,
  systemOptionFixtureId,
} from '../testing';
import {
  fetchMyTestScenarioStamp,
  fetchTestPlayerScenario,
  sampleFillByField,
  sampleSystemAnswers,
  setTestPlayerScenario,
} from './test-scenario';

const LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;

describe('the sample answers of a test player (RAPP-619, by field RAPP-664)', () => {
  const fields = systemFieldIndexFromCatalog(systemFieldsCatalogFixture());

  test('pass each field’s own check in every language', () => {
    for (const language of LANGUAGES) {
      const fill = sampleFillByField(fields, WIZARD_QUESTIONS, language);
      for (const [id, value] of Object.entries(fill.answers)) {
        const field = [...fields.values()].find((each) => each.id === id)!;
        const question = {
          type: field.type,
          settings: {},
          options: field.options.map((option) => ({ ...option, label: option.label })),
        };
        expect(customAnswerSchema(question as never).safeParse(value).success).toBe(true);
      }
      expect(fill.first_name).toBe('Prova');
    }
  });

  test('are in her language where the answer is text', () => {
    expect(sampleSystemAnswers('ca').address).not.toBe(sampleSystemAnswers('ar').address);
    expect(sampleSystemAnswers('fa').specific_needs).toEqual(['other']);
  });

  test('cover every wizard question, through that question’s fields only', () => {
    for (const question of WIZARD_QUESTIONS) {
      const fill = sampleFillByField(fields, [question], 'ca');
      const sent = [
        ...Object.keys(fill.answers),
        ...Object.keys(fill).filter((key) => key !== 'answers'),
      ];
      expect(sent.length).toBeGreaterThan(0);
    }
    expect(sampleFillByField(fields, ['phone', 'dependents', 'preferred_language'], 'en')).toEqual({
      preferred_language: 'en',
      answers: {
        [systemFieldFixtureId('phone')]: '+34600111222',
        [systemFieldFixtureId('has_dependents')]: systemOptionFixtureId('has_dependents', 'no'),
      },
    });
  });

  test('a field whose type no longer has the sample’s option is left out', () => {
    const changed = new Map(fields);
    changed.set('clothing_size', { ...fields.get('clothing_size')!, options: [] });
    expect(sampleFillByField(changed, ['clothing_size'], 'ca').answers).toEqual({});
  });
});

describe('the scenario calls (RAPP-619)', () => {
  const id = '5eed0000-0000-4000-8000-000000000096';
  function client(data: unknown, error: { message: string } | null = null) {
    const calls: unknown[] = [];
    return {
      calls,
      rpc: async (name: string, args?: unknown) => {
        calls.push([name, args]);
        return { data, error };
      },
    } as unknown as Parameters<typeof setTestPlayerScenario>[0] & { calls: unknown[] };
  }

  test('a switch is one call with the change', async () => {
    const fake = client(null);
    await setTestPlayerScenario(fake, id, { kind: 'season_signature', signed: true });
    expect(fake.calls).toEqual([
      [
        'set_test_player_scenario',
        { p_profile_id: id, p_change: { kind: 'season_signature', signed: true } },
      ],
    ]);
  });

  test("the app questions' samples and clears travel by field (RAPP-661)", async () => {
    const calls: unknown[] = [];
    const fake = {
      rpc: async (name: string, args?: unknown) => {
        calls.push([name, args]);
        return name === 'intake_catalog'
          ? { data: systemFieldsCatalogFixture(), error: null }
          : { data: null, error: null };
      },
    } as unknown as Parameters<typeof setTestPlayerScenario>[0];
    await setTestPlayerScenario(fake, id, {
      kind: 'answers',
      fill: ['first_name', 'clothing_size'],
      clear: ['document'],
    });
    expect(calls[1]).toEqual([
      'set_test_player_scenario',
      {
        p_profile_id: id,
        p_change: {
          kind: 'answers',
          fill: {
            first_name: 'Prova',
            answers: {
              [systemFieldFixtureId('clothing_size')]: systemOptionFixtureId('clothing_size', 'M'),
            },
          },
          clear: [
            systemFieldFixtureId('document_type'),
            systemFieldFixtureId('document_number'),
            systemFieldFixtureId('document_name'),
          ],
        },
      },
    ]);
  });

  test("the staff fields' switch is the same answers switch", async () => {
    const fake = client(null);
    await setTestPlayerScenario(fake, id, {
      kind: 'custom_answers',
      fill: { '5eed0000-0000-4000-8045-000000000001': 'yes' },
      clear: ['5eed0000-0000-4000-8045-000000000002'],
    });
    expect(fake.calls).toEqual([
      [
        'set_test_player_scenario',
        {
          p_profile_id: id,
          p_change: {
            kind: 'answers',
            fill: { answers: { '5eed0000-0000-4000-8045-000000000001': 'yes' } },
            clear: ['5eed0000-0000-4000-8045-000000000002'],
          },
        },
      ],
    ]);
  });

  test('a refusal is a typed error', async () => {
    await expect(
      setTestPlayerScenario(
        client(null, { message: 'scenario switches are for test players only' }),
        id,
        {
          kind: 'reset',
        },
      ),
    ).rejects.toMatchObject({ name: 'AppError' });
  });

  test('her situation is read and parsed', async () => {
    const scenario = await fetchTestPlayerScenario(
      client({
        terms_accepted: true,
        current_season: '2026/27',
        signed_this_season: false,
        returning: true,
        answered: ['phone'],
        preferred_language: 'ar',
      }),
      id,
    );
    expect(scenario.termsAccepted).toBe(true);
    expect(scenario.returning).toBe(true);
    expect(scenario.answered.has('phone')).toBe(true);
    expect(scenario.language).toBe('ar');
    // An older server sends no draft flags: nothing is a draft.
    expect(scenario.termsDraft).toBe(false);
    expect(scenario.authorizationDraft).toBe(false);
  });

  test('her page knows when her phone shows a draft (RAPP-619)', async () => {
    const scenario = await fetchTestPlayerScenario(
      client({
        terms_accepted: false,
        current_season: '2026/27',
        signed_this_season: false,
        returning: false,
        answered: [],
        preferred_language: 'ca',
        terms_draft: true,
        authorization_draft: true,
      }),
      id,
    );
    expect(scenario.termsDraft).toBe(true);
    expect(scenario.authorizationDraft).toBe(true);
  });

  test('her app reads the stamp, or none', async () => {
    expect(await fetchMyTestScenarioStamp(client('2026-10-22T10:00:00+00:00'))).toBe(
      '2026-10-22T10:00:00+00:00',
    );
    expect(await fetchMyTestScenarioStamp(client(null))).toBeNull();
  });
});
