import { describe, expect, test } from 'bun:test';
import { serviceInputSchema } from '../schemas/services';
import {
  createServiceCategoryContract,
  getServiceCategoryContract,
  serializeServiceCategoryMetadataSchema,
  SERVICE_CATEGORY_DEFINITIONS,
  type ServiceCategoryDefinition,
  type ServiceCategorySlug,
} from './definitions';
import { applyServiceDirectoryFilters } from './filters';
import {
  canTransitionServiceStatus,
  SERVICE_SUBMISSION_STATUSES,
  serviceStatusTransitionSchema,
} from './state-machine';

const validMetadata: Readonly<Record<ServiceCategorySlug, Readonly<Record<string, unknown>>>> = {
  housing: {
    housing_type: 'shared_flat',
    duration: 'temporary',
    deposit_required: true,
    deposit_amount: 250,
    for_whom: 'women_only',
    restrictions: 'Empadronament required',
  },
  'language-courses': {
    language_taught: 'catalan',
    level: 'beginner',
    modality: 'in_person',
    registration_deadline: '2026-09-15',
  },
  'job-insertion': {
    job_type: 'cv_workshop',
    sector: 'admin',
    requirements: 'Bring a current CV',
    language_required: 'catalan',
  },
  'legal-aid': {
    legal_type: 'residency',
    languages_available: ['ca', 'es', 'ar'],
    appointment_required: true,
  },
  health: {
    health_type: 'mental_health',
    health_card_required: false,
    languages_available: ['ca', 'es', 'fa'],
    appointment_required: true,
  },
  training: {
    training_type: 'digital_literacy',
    modality: 'hybrid',
    requirements: 'Basic smartphone use',
    registration_deadline: '2026-10-01',
  },
  'leisure-culture': {
    activity_type: 'sports',
    family_friendly: true,
    age_restriction: 16,
  },
  documentation: {
    document_type: 'empadronament',
    appointment_required: true,
    documents_needed: 'Passport and rental contract',
    languages_available: ['ca', 'es'],
    processing_time: 'Two weeks',
  },
};

const invalidMetadata: Readonly<Record<ServiceCategorySlug, Readonly<Record<string, unknown>>>> = {
  housing: { ...validMetadata.housing, housing_type: 'hotel' },
  'language-courses': { ...validMetadata['language-courses'], level: 'native' },
  'job-insertion': { ...validMetadata['job-insertion'], sector: 'astronautics' },
  'legal-aid': { ...validMetadata['legal-aid'], languages_available: [] },
  health: { ...validMetadata.health, appointment_required: 'yes' },
  training: { ...validMetadata.training, registration_deadline: '01/10/2026' },
  'leisure-culture': { ...validMetadata['leisure-culture'], age_restriction: -1 },
  documentation: { ...validMetadata.documentation, document_type: 'passport_renewal' },
};

describe('service category contracts', () => {
  test('defines the complete ordered catalog of eight categories', () => {
    expect(SERVICE_CATEGORY_DEFINITIONS.map(({ slug }) => slug)).toEqual([
      'housing',
      'language-courses',
      'job-insertion',
      'legal-aid',
      'health',
      'training',
      'leisure-culture',
      'documentation',
    ]);
  });

  test.each(Object.keys(validMetadata) as ServiceCategorySlug[])(
    '%s accepts its valid fixture and rejects its invalid fixture',
    (slug) => {
      const contract = getServiceCategoryContract(slug);

      expect(contract.metadataSchema.safeParse(validMetadata[slug]).success).toBe(true);
      expect(contract.metadataSchema.safeParse(invalidMetadata[slug]).success).toBe(false);
      expect(
        contract.metadataSchema.safeParse({ ...validMetadata[slug], unexpected: true }).success,
      ).toBe(false);
    },
  );

  test('a new filterable category field reaches the player filters without screen-specific code', () => {
    const definition: ServiceCategoryDefinition = {
      slug: 'proof-category',
      name: { ca: 'Prova', es: 'Prueba', en: 'Proof', ar: 'إثبات', fa: 'اثبات' },
      icon: 'flask-conical',
      color: 'primary',
      sortOrder: 999,
      fields: [
        {
          key: 'delivery_mode',
          label: {
            ca: 'Modalitat',
            es: 'Modalidad',
            en: 'Delivery mode',
            ar: 'طريقة التقديم',
            fa: 'روش ارائه',
          },
          type: 'select',
          required: true,
          filterable: true,
          options: ['in_person', 'online'],
        },
        {
          key: 'delivery_window',
          label: {
            ca: 'Franja horària',
            es: 'Franja horaria',
            en: 'Delivery window',
            ar: 'الفترة الزمنية',
            fa: 'بازه زمانی',
          },
          type: 'select',
          required: false,
          filterable: true,
          options: ['morning', 'afternoon'],
        },
      ],
    };
    const contract = createServiceCategoryContract(definition);

    expect(contract.filterFields.map(({ key }) => key)).toEqual([
      'delivery_mode',
      'delivery_window',
    ]);
    expect(
      contract.metadataSchema.safeParse({
        delivery_mode: 'online',
        delivery_window: 'morning',
      }).success,
    ).toBe(true);
    expect(contract.metadataSchema.safeParse({ delivery_mode: 'hybrid' }).success).toBe(false);
    expect(
      contract.buildMetadataFilter({ delivery_mode: 'online', delivery_window: 'afternoon' }),
    ).toEqual({
      delivery_mode: 'online',
      delivery_window: 'afternoon',
    });
  });

  test('the SQL seed carries the serialized form definitions without drift', async () => {
    const seedSql = await Bun.file(new URL('../../../supabase/seed.sql', import.meta.url)).text();

    for (const definition of SERVICE_CATEGORY_DEFINITIONS) {
      expect(seedSql).toContain(JSON.stringify(serializeServiceCategoryMetadataSchema(definition)));
    }
  });
});

describe('service shared validation', () => {
  const baseService = {
    categorySlug: 'housing',
    title: { ca: 'Habitació segura' },
    description: { ca: 'Habitació compartida prop de Vic.' },
    providerName: 'Fundació Habitat3',
    location: 'Vic',
    zone: 'Osona',
    costType: 'subsidized',
    costAmount: 120,
    costDetails: null,
    contactName: 'Anna Serra',
    contactPhone: '+34930000000',
    contactEmail: 'habitatge@example.test',
    contactRole: 'Coordinació',
    schedule: 'De dilluns a divendres, de 9 a 14 h',
    externalUrl: 'https://example.test/habitatge',
    availability: 'available',
    metadata: validMetadata.housing,
    status: 'draft',
    publishedAt: null,
    expiresAt: null,
  } as const;

  test('validates shared fields and category metadata together', () => {
    expect(serviceInputSchema.safeParse(baseService).success).toBe(true);
    expect(
      serviceInputSchema.safeParse({ ...baseService, metadata: invalidMetadata.housing }).success,
    ).toBe(false);
  });

  test('enforces publication windows and exact monetary values', () => {
    expect(
      serviceInputSchema.safeParse({ ...baseService, status: 'published', publishedAt: null })
        .success,
    ).toBe(false);
    expect(
      serviceInputSchema.safeParse({ ...baseService, costType: 'paid', costAmount: -1 }).success,
    ).toBe(false);
    expect(
      serviceInputSchema.safeParse({
        ...baseService,
        status: 'published',
        publishedAt: '2026-09-10T09:00:00.000Z',
        expiresAt: '2026-09-10T08:59:59.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('service directory query helper', () => {
  test('uses shared columns for shared filters and one JSONB containment predicate for metadata', () => {
    const calls: Array<readonly [string, string, unknown]> = [];
    const query = {
      eq(column: string, value: unknown) {
        calls.push(['eq', column, value]);
        return this;
      },
      contains(column: string, value: unknown) {
        calls.push(['contains', column, value]);
        return this;
      },
    };

    expect(
      applyServiceDirectoryFilters(query, {
        categoryId: '5eed0000-0000-4000-8009-000000000001',
        categorySlug: 'housing',
        zone: 'Osona',
        costType: 'subsidized',
        availability: 'available',
        metadata: { housing_type: 'shared_flat', for_whom: 'women_only' },
      }),
    ).toBe(query);
    expect(calls).toEqual([
      ['eq', 'category_id', '5eed0000-0000-4000-8009-000000000001'],
      ['eq', 'zone', 'Osona'],
      ['eq', 'cost_type', 'subsidized'],
      ['eq', 'availability', 'available'],
      ['contains', 'metadata', { housing_type: 'shared_flat', for_whom: 'women_only' }],
    ]);
  });

  test('uses the runtime category contract for a staff-added filter field', () => {
    const definition: ServiceCategoryDefinition = {
      slug: 'proof-category',
      name: { ca: 'Prova', es: 'Prueba', en: 'Proof', ar: 'إثبات', fa: 'اثبات' },
      icon: 'flask-conical',
      color: 'primary',
      sortOrder: 999,
      fields: [
        {
          key: 'delivery_window',
          label: {
            ca: 'Franja horària',
            es: 'Franja horaria',
            en: 'Delivery window',
            ar: 'الفترة الزمنية',
            fa: 'بازه زمانی',
          },
          type: 'select',
          required: false,
          filterable: true,
          options: ['morning', 'afternoon'],
        },
      ],
    };
    const calls: Array<readonly [string, string, unknown]> = [];
    const query = {
      eq(column: string, value: unknown) {
        calls.push(['eq', column, value]);
        return this;
      },
      contains(column: string, value: unknown) {
        calls.push(['contains', column, value]);
        return this;
      },
    };

    applyServiceDirectoryFilters(query, {
      categoryId: '5eed0000-0000-4000-8009-000000000099',
      categorySlug: definition.slug as never,
      categoryContract: createServiceCategoryContract(definition),
      metadata: { delivery_window: 'morning' },
    });

    expect(calls).toEqual([
      ['eq', 'category_id', '5eed0000-0000-4000-8009-000000000099'],
      ['contains', 'metadata', { delivery_window: 'morning' }],
    ]);
  });
});

describe('service submission state machine', () => {
  test('exposes the five states needed by staff and entity flows', () => {
    expect(SERVICE_SUBMISSION_STATUSES).toEqual([
      'draft',
      'pending',
      'approved',
      'rejected',
      'published',
    ]);
  });

  test('allows review and publication paths while refusing skipped review', () => {
    expect(canTransitionServiceStatus('draft', 'pending')).toBe(true);
    expect(canTransitionServiceStatus('draft', 'published')).toBe(true);
    expect(canTransitionServiceStatus('pending', 'approved')).toBe(true);
    expect(canTransitionServiceStatus('pending', 'rejected')).toBe(true);
    expect(canTransitionServiceStatus('approved', 'published')).toBe(true);
    expect(canTransitionServiceStatus('pending', 'published')).toBe(false);
    expect(canTransitionServiceStatus('rejected', 'approved')).toBe(false);
    expect(
      serviceStatusTransitionSchema.safeParse({ from: 'pending', to: 'published' }).success,
    ).toBe(false);
  });
});
