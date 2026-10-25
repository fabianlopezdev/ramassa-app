import { describe, expect, test } from 'bun:test';
import { WIZARD_QUESTIONS } from '../onboarding/question-states';
import { questionPayloadKeys } from '../onboarding/system-fields';
import { profileEditSchema } from '../schemas/profile';
import { decodeSupportNeeds } from '../schemas/support-needs';
import {
  systemFieldFixtureId,
  systemFieldsCatalogFixture,
  systemOptionFixtureId,
} from '../testing';
import {
  fetchMyTestScenarioStamp,
  fetchTestPlayerScenario,
  sampleAnswerPayload,
  sampleAnswersFor,
  sampleProfileAnswers,
  setTestPlayerScenario,
} from './test-scenario';

const LANGUAGES = ['ca', 'es', 'en', 'ar', 'fa'] as const;
const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

describe('the sample answers of a test player (RAPP-619)', () => {
  test('pass the shared profile schema in every language', () => {
    for (const language of LANGUAGES) {
      const sample = sampleProfileAnswers(language);
      const parsed = profileEditSchema.safeParse({
        ...Object.fromEntries(Object.entries(sample).map(([key, value]) => [camel(key), value])),
        mediaConsent: false,
      });
      expect(parsed.success).toBe(true);
      expect(sample.preferred_language).toBe(language);
    }
  });

  test('are in her language where the answer is text', () => {
    expect(sampleProfileAnswers('ca').address).not.toBe(sampleProfileAnswers('ar').address);
    expect(
      decodeSupportNeeds(sampleProfileAnswers('fa').specific_needs as string)?.categories,
    ).toEqual(['other']);
  });

  test('cover every wizard question, with that question’s keys only', () => {
    for (const question of WIZARD_QUESTIONS) {
      const payload = sampleAnswerPayload(question, 'ca');
      expect(Object.keys(payload).length).toBeGreaterThan(0);
      for (const key of Object.keys(payload)) {
        expect(questionPayloadKeys(question)).toContain(key);
      }
    }
    expect(sampleAnswersFor(['phone', 'dependents'], 'en')).toEqual({
      phone: '+34600111222',
      has_dependents: false,
      num_dependents: 0,
    });
  });

  test('are the same every time', () => {
    expect(sampleProfileAnswers('es')).toEqual(sampleProfileAnswers('es'));
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
      fill: { first_name: 'Joana', clothing_size: 'M' },
      clear: ['document'],
    });
    expect(calls[1]).toEqual([
      'set_test_player_scenario',
      {
        p_profile_id: id,
        p_change: {
          kind: 'answers',
          fill: {
            first_name: 'Joana',
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
