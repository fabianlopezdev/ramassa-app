/**
 * Scenario switches on a test player (RAPP-619).
 *
 * The person designing the onboarding sets the situation of a made-up woman,
 * then opens the app as her: which wizard questions she already has answered,
 * whether she accepted the app terms, whether she signed this season's
 * authorization, and whether she is returning from an earlier season.
 *
 * An answer staff fill in is a fixed sample per question, in her language,
 * that passes the same shared schema her own answers pass
 * (`profileEditSchema`). The database records it as a staff answer, so her
 * wizard treats the question as answered (RAPP-300). Every switch is one call
 * of `set_test_player_scenario`, which refuses any woman who is not a test
 * player.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, databaseErrorCode } from '../errors';
import {
  placementsOf,
  questionOfField,
  sampleCustomAnswer,
  type CustomAnswerValue,
  type CustomQuestion,
  type IntakeCatalog,
} from '../intake-builder';
import {
  fetchSystemFieldIndex,
  systemFieldIdsOfQuestions,
  withFieldAnswers,
} from '../intake-builder/field-answers';
import type { IntakeQuestion } from '../onboarding/intake';
import { questionPayloadKeys } from '../onboarding/system-fields';
import type { LanguageCode } from '../schemas/language';
import { encodeSupportNeeds } from '../schemas/support-needs';
import type { Database, Json } from '../types/database';

type Client = SupabaseClient<Database>;

const SAMPLE_TEXTS: Readonly<
  Record<
    LanguageCode,
    {
      readonly address: string;
      readonly entity: string;
      readonly contact: string;
      readonly need: string;
    }
  >
> = {
  ca: {
    address: 'Carrer de la Prova, 1',
    entity: 'Entitat de prova',
    contact: 'Persona de referència de prova',
    need: 'Resposta de prova: prefereix entrenar a la tarda.',
  },
  es: {
    address: 'Calle de la Prueba, 1',
    entity: 'Entidad de prueba',
    contact: 'Persona de referencia de prueba',
    need: 'Respuesta de prueba: prefiere entrenar por la tarde.',
  },
  en: {
    address: '1 Test Street',
    entity: 'Test entity',
    contact: 'Test contact person',
    need: 'Test answer: she prefers to train in the afternoon.',
  },
  ar: {
    address: 'شارع الاختبار 1',
    entity: 'جهة اختبار',
    contact: 'شخص مرجعي للاختبار',
    need: 'إجابة اختبار: تفضّل التدريب بعد الظهر.',
  },
  fa: {
    address: 'خیابان آزمایش ۱',
    entity: 'نهاد آزمایشی',
    contact: 'فرد رابط آزمایشی',
    need: 'پاسخ آزمایشی: ترجیح می‌دهد بعدازظهر تمرین کند.',
  },
};

/**
 * A complete sample profile, in the database's keys. Canonical values for the
 * lists (country, municipality, sizes) are the same in every language, as
 * every stored answer is (rule 18).
 */
export function sampleProfileAnswers(language: LanguageCode): Readonly<Record<string, unknown>> {
  const texts = SAMPLE_TEXTS[language];
  return {
    first_name: 'Prova',
    last_name: 'Proveta',
    date_of_birth: '1995-05-15',
    place_of_birth: 'Marroc',
    nationality: 'Marroc',
    preferred_language: language,
    document_type: 'none',
    phone: '+34600111222',
    address: texts.address,
    city: 'Vic',
    postal_code: '08500',
    reference_entity: texts.entity,
    reference_contact_name: texts.contact,
    has_dependents: false,
    num_dependents: 0,
    clothing_size: 'M',
    shoe_size: '38',
    applicant_status: 'prefer_not_to_say',
    supporting_entities: [texts.entity],
    childcare_need: 'no',
    specific_needs: encodeSupportNeeds({
      categories: ['other'],
      details: { other: texts.need },
    }),
  };
}

/** The sample answer of one question: only that question's keys. */
export function sampleAnswerPayload(
  question: IntakeQuestion,
  language: LanguageCode,
): Readonly<Record<string, unknown>> {
  const sample = sampleProfileAnswers(language);
  return Object.fromEntries(
    questionPayloadKeys(question)
      .filter((key) => key in sample)
      .map((key) => [key, sample[key]]),
  );
}

/** The sample answers of several questions, as one `fill`. */
export function sampleAnswersFor(
  questions: readonly IntakeQuestion[],
  language: LanguageCode,
): Readonly<Record<string, unknown>> {
  return Object.assign({}, ...questions.map((question) => sampleAnswerPayload(question, language)));
}

/** The live Ramassà fields her onboarding or her season form asks. */
export function scenarioCustomQuestions(catalog: IntakeCatalog): readonly CustomQuestion[] {
  const layout = catalog.layout;
  if (layout === undefined) return [];
  return layout.fields
    .filter(
      (field) =>
        field.kind === 'custom' &&
        !field.isArchived &&
        placementsOf(layout, field.id).some((placement) => placement.surface !== 'entity_form'),
    )
    .map((field) => questionOfField(layout, field));
}

/**
 * A valid sample answer for each of these staff questions, in her language
 * (RAPP-610): every type, a file and a signature included. A choice question
 * with no live option has no sample and is left out.
 */
export function sampleCustomAnswersFor(
  questions: readonly CustomQuestion[],
  language: LanguageCode,
  owner: { readonly orgId: string; readonly profileId: string },
): Readonly<Record<string, CustomAnswerValue>> {
  return Object.fromEntries(
    questions.flatMap((question) => {
      const sample = sampleCustomAnswer(question, language, owner);
      return sample === '' || (Array.isArray(sample) && sample.length === 0)
        ? []
        : [[question.id, sample]];
    }),
  );
}

export type TestPlayerScenarioChange =
  | {
      readonly kind: 'answers';
      readonly fill?: Readonly<Record<string, unknown>>;
      readonly clear?: readonly IntakeQuestion[];
    }
  | {
      /** Staff questions (RAPP-610): {question id: sample answer} and ids to clear. */
      readonly kind: 'custom_answers';
      readonly fill?: Readonly<Record<string, CustomAnswerValue>>;
      readonly clear?: readonly string[];
    }
  | { readonly kind: 'terms'; readonly accepted: boolean }
  | { readonly kind: 'season_signature'; readonly signed: boolean }
  | { readonly kind: 'returning'; readonly returning: boolean }
  | { readonly kind: 'reset' };

/**
 * The change as the database takes it (RAPP-661): answers by field. The app
 * questions' samples are in her profile's column names and their clears in
 * questions until her page renders every field (RAPP-664); the staff fields'
 * switch is the same `answers` switch.
 */
async function scenarioChangeByField(
  client: Client,
  change: TestPlayerScenarioChange,
): Promise<Json> {
  if (change.kind === 'custom_answers') {
    return {
      kind: 'answers',
      fill: { answers: { ...change.fill } as Json },
      clear: [...(change.clear ?? [])],
    };
  }
  if (change.kind !== 'answers') return change as unknown as Json;
  const fields = await fetchSystemFieldIndex(client);
  return {
    kind: 'answers',
    fill: withFieldAnswers(fields, change.fill ?? {}),
    clear: [...systemFieldIdsOfQuestions(fields, change.clear ?? [])],
  };
}

export async function setTestPlayerScenario(
  client: Client,
  profileId: string,
  change: TestPlayerScenarioChange,
): Promise<void> {
  const { error } = await client.rpc('set_test_player_scenario', {
    p_profile_id: z.uuid().parse(profileId),
    p_change: await scenarioChangeByField(client, change),
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
}

export const testPlayerScenarioSchema = z
  .object({
    terms_accepted: z.boolean(),
    current_season: z.string().nullable(),
    signed_this_season: z.boolean(),
    returning: z.boolean(),
    answered: z.array(z.string()),
    // The staff questions she has an answer to (RAPP-610); an older server sends none.
    custom_answered: z.array(z.string()).optional(),
    org_id: z.uuid().optional(),
    preferred_language: z.enum(['ca', 'es', 'en', 'ar', 'fa']).catch('ca'),
    // Her phone shows the draft terms or authorization (RAPP-619); an older server sends neither.
    terms_draft: z.boolean().optional().default(false),
    authorization_draft: z.boolean().optional().default(false),
  })
  .transform((row) => ({
    termsAccepted: row.terms_accepted,
    currentSeason: row.current_season,
    signedThisSeason: row.signed_this_season,
    returning: row.returning,
    answered: new Set(row.answered),
    customAnswered: new Set(row.custom_answered ?? []),
    orgId: row.org_id ?? null,
    language: row.preferred_language as LanguageCode,
    termsDraft: row.terms_draft,
    authorizationDraft: row.authorization_draft,
  }));
export type TestPlayerScenario = z.infer<typeof testPlayerScenarioSchema>;

/** Her situation, as her page shows it. Refused for anyone but a test player. */
export async function fetchTestPlayerScenario(
  client: Client,
  profileId: string,
): Promise<TestPlayerScenario> {
  const { data, error } = await client.rpc('test_player_scenario', {
    p_profile_id: z.uuid().parse(profileId),
  });
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
  return testPlayerScenarioSchema.parse(data);
}

/**
 * When a test player's situation last changed; null for everyone else. Her
 * app drops a wizard draft older than this (RAPP-619).
 */
export async function fetchMyTestScenarioStamp(client: Client): Promise<string | null> {
  const { data, error } = await client.rpc('my_test_scenario_stamp');
  if (error) throw new AppError(databaseErrorCode(error.message), { message: error.message });
  return z
    .string()
    .nullable()
    .parse(data ?? null);
}
