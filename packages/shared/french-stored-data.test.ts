/**
 * French came after the content (RAPP-781). Every stored shape keyed by
 * language must still read when it has no French, read French when it has it,
 * and fall back to Catalan for a French reader. Publishing asks for French.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { fetchMyConsents } from './authorization/authorization';
import { fetchForumCategories, moveForumCategory } from './forum';
import { resolveLocalizedText } from './i18n/localized-content';
import { fetchNotificationTemplates } from './notifications';
import {
  draftTranslationsSchema,
  languageCodeSchema,
  publishedTranslationsSchema,
  storedTranslationsSchema,
} from './schemas/language';
import { parseServiceCategoryRow, serviceCategoryInputSchema } from './services/admin';
import { fetchPlayerSurveys, resolveSurveyCopy, surveyDefinitionSchema } from './surveys';
import { isTranslationReviewPublishable, type TranslationReview } from './translation';

const zText = z.string().trim().min(1);
const fiveLanguages = { ca: 'Hola', es: 'Hola', en: 'Hello', ar: 'مرحبا', fa: 'سلام' };
const sixLanguages = { ...fiveLanguages, fr: 'Bonjour' };

/** A client whose one query answers with these rows. */
function rowsClient(data: unknown) {
  const result = { data, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    abortSignal: () => chain,
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return {
    from: () => chain,
    rpc: () => chain,
  } as never;
}

describe('the language list (RAPP-781)', () => {
  test('French sits after English in the picker order', () => {
    expect(languageCodeSchema.options).toEqual(['ca', 'es', 'en', 'fr', 'ar', 'fa']);
  });

  test('a stored text reads with or without French', () => {
    const stored = storedTranslationsSchema(zText);
    expect(stored.parse(fiveLanguages)).toEqual(fiveLanguages);
    expect(stored.parse(sixLanguages)).toEqual(sixLanguages);
  });

  test('a published text needs French, a draft does not', () => {
    expect(publishedTranslationsSchema(zText).safeParse(fiveLanguages).success).toBe(false);
    expect(publishedTranslationsSchema(zText).safeParse(sixLanguages).success).toBe(true);
    expect(draftTranslationsSchema(zText).safeParse({ ca: 'Hola' }).success).toBe(true);
  });

  test('a French reader of a text without French reads the Catalan', () => {
    expect(resolveLocalizedText(fiveLanguages, 'fr')).toEqual({ language: 'ca', text: 'Hola' });
    expect(resolveLocalizedText(sixLanguages, 'fr')).toEqual({ language: 'fr', text: 'Bonjour' });
  });
});

describe('stored rows from before French still read (RAPP-781)', () => {
  test('forum categories', async () => {
    const row = { id: crypto.randomUUID(), slug: 'general', icon: 'chat', color: 'primary' };
    const categories = await fetchForumCategories(
      rowsClient([
        { ...row, name: fiveLanguages, sort_order: 10 },
        { ...row, id: crypto.randomUUID(), name: sixLanguages, sort_order: 20 },
      ]),
    );
    expect(categories.map((category) => category.name.fr)).toEqual([undefined, 'Bonjour']);
  });

  test('moving a category from before French keeps its five names', async () => {
    const sent: unknown[] = [];
    const id = crypto.randomUUID();
    const client = {
      rpc: async (_name: string, args: unknown) => {
        sent.push(args);
        return { data: id, error: null };
      },
    } as never;
    await moveForumCategory(
      client,
      { id, name: fiveLanguages, slug: 'general', icon: 'chat', color: 'primary', sort_order: 10 },
      20,
    );
    expect(sent).toEqual([expect.objectContaining({ p_name: fiveLanguages, p_sort_order: 20 })]);
  });

  test('service categories, their labels and their fields', () => {
    const category = parseServiceCategoryRow({
      id: crypto.randomUUID(),
      name: fiveLanguages,
      slug: 'housing',
      icon: 'house',
      color: 'primary',
      sort_order: 10,
      metadata_schema: {
        fields: [
          {
            key: 'kind',
            label: fiveLanguages,
            type: 'text',
            required: false,
            filterable: false,
          },
        ],
      },
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
    });
    expect(category.name.fr).toBeUndefined();
    expect(
      serviceCategoryInputSchema.safeParse({
        name: category.name,
        slug: category.slug,
        icon: category.icon,
        color: category.color,
        metadataSchema: category.metadataSchema,
      }).success,
    ).toBe(false);
  });

  test('notification templates', async () => {
    const templates = await fetchNotificationTemplates(
      rowsClient([
        {
          id: crypto.randomUUID(),
          name: 'Reminder',
          category: 'transactional',
          title: fiveLanguages,
          body: fiveLanguages,
          created_at: '2026-11-01T10:00:00Z',
          updated_at: '2026-11-01T10:00:00Z',
        },
      ]),
    );
    expect(templates[0]?.title.fr).toBeUndefined();
  });

  test('a survey published before French, read in French', async () => {
    const question = {
      id: crypto.randomUUID(),
      type: 'multiple_choice',
      prompt: fiveLanguages,
      options: [
        { id: 'yes', label: fiveLanguages },
        { id: 'no', label: fiveLanguages },
      ],
      required: true,
      sortOrder: 0,
    };
    const [survey] = await fetchPlayerSurveys(
      rowsClient([
        {
          id: crypto.randomUUID(),
          title: fiveLanguages,
          event_id: null,
          published_at: '2026-11-01T10:00:00Z',
          closes_at: null,
          questions: [question],
          response_status: null,
          completed_at: null,
        },
      ]),
    );
    expect(survey === undefined ? null : resolveSurveyCopy(survey.title, 'fr')).toBe('Hola');
    expect(
      surveyDefinitionSchema.safeParse({
        title: fiveLanguages,
        eventId: null,
        publishedAt: '2026-11-01T10:00:00Z',
        closesAt: null,
        audience: { kind: 'all' },
        questions: [question],
      }).success,
    ).toBe(false);
  });

  test('her consents, with names in a language this build does not know', async () => {
    const consents = await fetchMyConsents(
      rowsClient([
        { consent_key: 'image_rights', granted: true, name: fiveLanguages },
        { consent_key: 'health_data', granted: false, name: { ...sixLanguages, xx: 'later' } },
      ]),
    );
    expect(consents.image_rights?.name).toEqual(fiveLanguages);
    expect(consents.health_data?.name).toEqual(sixLanguages);
  });
});

describe('a translation review asks for French (RAPP-781)', () => {
  const approved = (language: 'es' | 'en' | 'fr' | 'ar' | 'fa') => ({
    language,
    machineText: 'x',
    reviewedText: 'x',
    status: 'approved' as const,
  });
  const review = (languages: readonly ('es' | 'en' | 'fr' | 'ar' | 'fa')[]): TranslationReview => ({
    sourceLanguage: 'ca',
    sourceText: 'Hola',
    suggestions: languages.map(approved),
  });

  test('a review opened on a text from before French is not publishable', () => {
    expect(isTranslationReviewPublishable(review(['es', 'en', 'ar', 'fa']))).toBe(false);
  });

  test('every language approved, French too, publishes', () => {
    expect(isTranslationReviewPublishable(review(['es', 'en', 'fr', 'ar', 'fa']))).toBe(true);
  });
});
