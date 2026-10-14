import { describe, expect, test } from 'bun:test';
import {
  createAdminServiceInputSchema,
  parseServiceCategoryRow,
  type AdminServiceDetail,
} from '@ramassa/shared/services';
import { createTranslationReview, type TranslationReview } from '@ramassa/shared/translation';
import {
  areServiceTranslationsApproved,
  moveImage,
  readServiceDraft,
  startingServiceDraft,
  toServiceInput,
  withCategory,
  writeServiceDraft,
} from './service-draft';

const NOW = new Date('2026-10-14T10:00:00.000Z');
const label = (text: string) => ({ ca: text, es: text, en: text, ar: text, fa: text });

const leisure = parseServiceCategoryRow({
  id: '5eed0000-0000-4000-8009-000000000007',
  name: label('Lleure'),
  slug: 'leisure-culture',
  icon: 'ticket',
  color: 'accent',
  sort_order: 70,
  created_at: '2026-10-01T08:00:00+00:00',
  updated_at: '2026-10-01T08:00:00+00:00',
  metadata_schema: {
    fields: [
      {
        key: 'activity_type',
        type: 'select',
        label: label('Tipus'),
        options: ['sports', 'cultural'],
        required: true,
        filterable: true,
      },
      {
        key: 'family_friendly',
        type: 'boolean',
        label: label('Famílies'),
        required: true,
        filterable: true,
      },
      {
        key: 'age_restriction',
        type: 'number',
        label: label('Edat'),
        minimum: 0,
        required: false,
        filterable: true,
      },
    ],
  },
});

const other = parseServiceCategoryRow({
  ...{
    id: '5eed0000-0000-4000-8009-000000000002',
    name: label('Idiomes'),
    slug: 'language-courses',
    icon: 'book',
    color: 'primary',
    sort_order: 20,
    created_at: '2026-10-01T08:00:00+00:00',
    updated_at: '2026-10-01T08:00:00+00:00',
  },
  metadata_schema: {
    fields: [
      { key: 'notes', type: 'text', label: label('Notes'), required: false, filterable: false },
    ],
  },
});

function approved(text: string): TranslationReview {
  const review = createTranslationReview({
    sourceLanguage: 'ca',
    sourceText: text,
    translations: {
      es: `[es] ${text}`,
      en: `[en] ${text}`,
      ar: `[ar] ${text}`,
      fa: `[fa] ${text}`,
    },
  });
  return {
    ...review,
    suggestions: review.suggestions.map((s) => ({ ...s, status: 'approved' as const })),
  };
}

describe('the service form (RAPP-344)', () => {
  test('a new service starts with the category extra fields empty', () => {
    const form = startingServiceDraft(undefined, leisure, NOW);
    expect(form.metadata).toEqual({
      activity_type: '',
      family_friendly: false,
      age_restriction: '',
    });
    expect([form.costType, form.availability, form.mode]).toEqual(['free', 'available', 'draft']);
    expect(withCategory(form, other).metadata).toEqual({ notes: '' });
  });

  test('a published service with a photo becomes a valid input with every language', () => {
    const form = {
      ...startingServiceDraft(undefined, leisure, NOW),
      title: 'Taller de teatre',
      costType: 'paid' as const,
      costAmount: '12,5',
      contactEmail: ' teatre@example.test ',
      metadata: { activity_type: 'cultural', family_friendly: true, age_restriction: '' },
      images: [{ key: 'img-1', url: null, alt: 'Escenari' }],
      mode: 'now' as const,
    };
    const reviews = {
      title: approved('Taller de teatre'),
      description: undefined,
      images: { 'img-1': approved('Escenari') },
    };
    expect(areServiceTranslationsApproved(form, reviews)).toBe(true);
    const input = toServiceInput(form, reviews, {
      category: leisure,
      detail: undefined,
      canPublish: true,
      imageUrls: { 'img-1': 'services/a.webp' },
      now: NOW,
    });
    expect(input).toMatchObject({
      costAmount: 12.5,
      contactEmail: 'teatre@example.test',
      metadata: { activity_type: 'cultural', family_friendly: true },
      status: 'published',
      publishedAt: NOW.toISOString(),
      images: [{ url: 'services/a.webp', altText: { ca: 'Escenari', fa: '[fa] Escenari' } }],
    });
    expect(createAdminServiceInputSchema(leisure).safeParse(input).success).toBe(true);
  });

  test('a required extra field left empty, or a paid service with no amount, fails the check', () => {
    const base = { ...startingServiceDraft(undefined, leisure, NOW), title: 'Futbol' };
    const reviews = { title: undefined, description: undefined, images: {} };
    const context = { category: leisure, detail: undefined, canPublish: true, now: NOW };
    const schema = createAdminServiceInputSchema(leisure);
    expect(schema.safeParse(toServiceInput(base, reviews, context)).success).toBe(false);
    const answered = { ...base, metadata: { activity_type: 'sports', family_friendly: false } };
    expect(schema.safeParse(toServiceInput(answered, reviews, context)).success).toBe(true);
    expect(
      schema.safeParse(toServiceInput({ ...answered, costType: 'paid' }, reviews, context)).success,
    ).toBe(false);
  });

  test('a photo without approved descriptions blocks publishing', () => {
    const form = {
      ...startingServiceDraft(undefined, leisure, NOW),
      images: [{ key: 'a', url: 'services/a.webp', alt: 'Foto' }],
    };
    expect(
      areServiceTranslationsApproved(form, {
        title: approved('T'),
        description: undefined,
        images: {},
      }),
    ).toBe(false);
  });

  test('without the publish permission the publication stays as stored', () => {
    const detail = {
      service: {
        id: '22222222-2222-4222-8222-222222222222',
        category_id: leisure.id,
        title: label('Futbol'),
        description: null,
        status: 'published',
        published_at: '2026-10-01T08:00:00+00:00',
        expires_at: null,
        metadata: { activity_type: 'sports', family_friendly: false },
        cost_type: 'free',
        cost_amount: null,
        availability: 'available',
      },
      images: [],
    } as unknown as AdminServiceDetail;
    const form = { ...startingServiceDraft(detail, leisure, NOW), mode: 'draft' as const };
    const input = toServiceInput(
      form,
      { title: undefined, description: undefined, images: {} },
      { category: leisure, detail, canPublish: false, now: NOW },
    );
    expect([input.status, input.publishedAt]).toEqual(['published', '2026-10-01T08:00:00+00:00']);
  });

  test('photos reorder, and the form is kept per person and per service', () => {
    const images = [
      { key: 'a', url: null, alt: 'A' },
      { key: 'b', url: null, alt: 'B' },
    ];
    expect(moveImage(images, 1, -1).map((image) => image.key)).toEqual(['b', 'a']);
    expect(moveImage(images, 0, -1)).toBe(images);
    const values = new Map<string, string>();
    const storage = {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => void values.set(key, value),
      remove: (key: string) => values.delete(key),
    };
    writeServiceDraft(storage, 'u1', 'new', {
      ...startingServiceDraft(undefined, leisure),
      images,
    });
    expect(readServiceDraft(storage, 'u1', 'new')?.images[1]?.alt).toBe('B');
    expect(readServiceDraft(storage, 'u2', 'new')).toBeNull();
  });
});
