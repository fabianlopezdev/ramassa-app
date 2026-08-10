import { z } from 'zod';

export const SERVICE_METADATA_FIELD_TYPES = [
  'select',
  'string-array',
  'boolean',
  'number',
  'text',
  'date',
] as const;

export type ServiceMetadataFieldType = (typeof SERVICE_METADATA_FIELD_TYPES)[number];

export interface ServiceLocalizedLabel {
  readonly ca: string;
  readonly es: string;
  readonly en: string;
  readonly ar: string;
  readonly fa: string;
}

export interface ServiceMetadataFieldDefinition {
  readonly key: string;
  readonly label: ServiceLocalizedLabel;
  readonly type: ServiceMetadataFieldType;
  readonly required: boolean;
  readonly filterable: boolean;
  readonly options?: readonly string[];
  readonly minimum?: number;
}

export interface ServiceCategoryDefinition {
  readonly slug: string;
  readonly name: ServiceLocalizedLabel;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly fields: readonly ServiceMetadataFieldDefinition[];
}

const label = (
  ca: string,
  es: string,
  en: string,
  ar: string,
  fa: string,
): ServiceLocalizedLabel => ({ ca, es, en, ar, fa });

export const SERVICE_CATEGORY_DEFINITIONS = [
  {
    slug: 'housing',
    name: label('Allotjament', 'Alojamiento', 'Housing', 'السكن', 'مسکن'),
    icon: 'house',
    color: 'primary',
    sortOrder: 10,
    fields: [
      {
        key: 'housing_type',
        label: label(
          'Tipus d’allotjament',
          'Tipo de alojamiento',
          'Housing type',
          'نوع السكن',
          'نوع مسکن',
        ),
        type: 'select',
        required: true,
        filterable: true,
        options: ['room', 'shared_flat', 'apartment', 'emergency_shelter', 'social_housing'],
      },
      {
        key: 'duration',
        label: label('Durada', 'Duración', 'Duration', 'المدة', 'مدت'),
        type: 'select',
        required: true,
        filterable: true,
        options: ['temporary', 'long_term', 'emergency'],
      },
      {
        key: 'deposit_required',
        label: label(
          'Cal dipòsit',
          'Requiere depósito',
          'Deposit required',
          'يتطلب وديعة',
          'نیاز به ودیعه',
        ),
        type: 'boolean',
        required: true,
        filterable: true,
      },
      {
        key: 'deposit_amount',
        label: label(
          'Import del dipòsit',
          'Importe del depósito',
          'Deposit amount',
          'مبلغ الوديعة',
          'مبلغ ودیعه',
        ),
        type: 'number',
        required: false,
        filterable: false,
        minimum: 0,
      },
      {
        key: 'for_whom',
        label: label('Per a qui', 'Para quién', 'For whom', 'لمن', 'برای چه کسی'),
        type: 'select',
        required: true,
        filterable: true,
        options: ['women_only', 'families', 'singles', 'any'],
      },
      {
        key: 'restrictions',
        label: label('Restriccions', 'Restricciones', 'Restrictions', 'القيود', 'محدودیت‌ها'),
        type: 'text',
        required: false,
        filterable: false,
      },
    ],
  },
  {
    slug: 'language-courses',
    name: label(
      'Cursos d’idiomes',
      'Cursos de idiomas',
      'Language Courses',
      'دورات اللغة',
      'دوره‌های زبان',
    ),
    icon: 'languages',
    color: 'secondary',
    sortOrder: 20,
    fields: [
      {
        key: 'language_taught',
        label: label('Idioma', 'Idioma', 'Language taught', 'اللغة', 'زبان'),
        type: 'select',
        required: true,
        filterable: true,
        options: ['catalan', 'spanish', 'english', 'other'],
      },
      {
        key: 'level',
        label: label('Nivell', 'Nivel', 'Level', 'المستوى', 'سطح'),
        type: 'select',
        required: true,
        filterable: true,
        options: ['beginner', 'intermediate', 'advanced', 'all_levels'],
      },
      {
        key: 'modality',
        label: label('Modalitat', 'Modalidad', 'Modality', 'طريقة الدراسة', 'شیوه برگزاری'),
        type: 'select',
        required: true,
        filterable: true,
        options: ['in_person', 'online', 'hybrid'],
      },
      {
        key: 'registration_deadline',
        label: label(
          'Data límit',
          'Fecha límite',
          'Registration deadline',
          'آخر موعد للتسجيل',
          'مهلت ثبت‌نام',
        ),
        type: 'date',
        required: false,
        filterable: false,
      },
    ],
  },
  {
    slug: 'job-insertion',
    name: label(
      'Inserció laboral',
      'Inserción laboral',
      'Job Insertion',
      'الاندماج المهني',
      'ورود به بازار کار',
    ),
    icon: 'briefcase-business',
    color: 'primary',
    sortOrder: 30,
    fields: [
      {
        key: 'job_type',
        label: label(
          'Tipus de recurs',
          'Tipo de recurso',
          'Job resource type',
          'نوع المورد',
          'نوع منبع شغلی',
        ),
        type: 'select',
        required: true,
        filterable: true,
        options: ['job_offer', 'training', 'cv_workshop', 'interview_prep', 'internship'],
      },
      {
        key: 'sector',
        label: label('Sector', 'Sector', 'Sector', 'القطاع', 'بخش'),
        type: 'select',
        required: true,
        filterable: true,
        options: ['hospitality', 'care', 'cleaning', 'retail', 'admin', 'other'],
      },
      {
        key: 'requirements',
        label: label('Requisits', 'Requisitos', 'Requirements', 'المتطلبات', 'شرایط'),
        type: 'text',
        required: false,
        filterable: false,
      },
      {
        key: 'language_required',
        label: label(
          'Idioma requerit',
          'Idioma requerido',
          'Language required',
          'اللغة المطلوبة',
          'زبان مورد نیاز',
        ),
        type: 'select',
        required: false,
        filterable: true,
        options: ['catalan', 'spanish', 'english', 'none'],
      },
    ],
  },
  {
    slug: 'legal-aid',
    name: label(
      'Assessoria jurídica',
      'Asesoría jurídica',
      'Legal Aid',
      'المساعدة القانونية',
      'کمک حقوقی',
    ),
    icon: 'scale',
    color: 'secondary',
    sortOrder: 40,
    fields: [
      {
        key: 'legal_type',
        label: label(
          'Tipus d’assessoria',
          'Tipo de asesoría',
          'Legal aid type',
          'نوع المساعدة',
          'نوع کمک حقوقی',
        ),
        type: 'select',
        required: true,
        filterable: true,
        options: [
          'asylum',
          'residency',
          'family_reunification',
          'labor_rights',
          'gender_violence',
          'general',
        ],
      },
      {
        key: 'languages_available',
        label: label(
          'Idiomes disponibles',
          'Idiomas disponibles',
          'Languages available',
          'اللغات المتاحة',
          'زبان‌های موجود',
        ),
        type: 'string-array',
        required: true,
        filterable: true,
        options: ['ca', 'es', 'en', 'ar', 'fa'],
      },
      {
        key: 'appointment_required',
        label: label(
          'Cal cita',
          'Requiere cita',
          'Appointment required',
          'يتطلب موعداً',
          'نیاز به وقت قبلی',
        ),
        type: 'boolean',
        required: true,
        filterable: true,
      },
    ],
  },
  {
    slug: 'health',
    name: label('Salut', 'Salud', 'Health', 'الصحة', 'سلامت'),
    icon: 'heart-pulse',
    color: 'primary',
    sortOrder: 50,
    fields: [
      {
        key: 'health_type',
        label: label(
          'Tipus d’atenció',
          'Tipo de atención',
          'Health service type',
          'نوع الرعاية',
          'نوع خدمات سلامت',
        ),
        type: 'select',
        required: true,
        filterable: true,
        options: ['medical', 'dental', 'mental_health', 'reproductive', 'emergency'],
      },
      {
        key: 'health_card_required',
        label: label(
          'Cal targeta sanitària',
          'Requiere tarjeta sanitaria',
          'Health card required',
          'تتطلب بطاقة صحية',
          'نیاز به کارت سلامت',
        ),
        type: 'boolean',
        required: true,
        filterable: true,
      },
      {
        key: 'languages_available',
        label: label(
          'Idiomes disponibles',
          'Idiomas disponibles',
          'Languages available',
          'اللغات المتاحة',
          'زبان‌های موجود',
        ),
        type: 'string-array',
        required: true,
        filterable: true,
        options: ['ca', 'es', 'en', 'ar', 'fa'],
      },
      {
        key: 'appointment_required',
        label: label(
          'Cal cita',
          'Requiere cita',
          'Appointment required',
          'يتطلب موعداً',
          'نیاز به وقت قبلی',
        ),
        type: 'boolean',
        required: true,
        filterable: true,
      },
    ],
  },
  {
    slug: 'training',
    name: label('Formació', 'Formación', 'Training', 'التدريب', 'آموزش'),
    icon: 'graduation-cap',
    color: 'secondary',
    sortOrder: 60,
    fields: [
      {
        key: 'training_type',
        label: label(
          'Tipus de formació',
          'Tipo de formación',
          'Training type',
          'نوع التدريب',
          'نوع آموزش',
        ),
        type: 'select',
        required: true,
        filterable: true,
        options: ['digital_literacy', 'professional', 'certificate'],
      },
      {
        key: 'modality',
        label: label('Modalitat', 'Modalidad', 'Modality', 'طريقة الدراسة', 'شیوه برگزاری'),
        type: 'select',
        required: true,
        filterable: true,
        options: ['in_person', 'online', 'hybrid'],
      },
      {
        key: 'requirements',
        label: label('Requisits', 'Requisitos', 'Requirements', 'المتطلبات', 'شرایط'),
        type: 'text',
        required: false,
        filterable: false,
      },
      {
        key: 'registration_deadline',
        label: label(
          'Data límit',
          'Fecha límite',
          'Registration deadline',
          'آخر موعد للتسجيل',
          'مهلت ثبت‌نام',
        ),
        type: 'date',
        required: false,
        filterable: false,
      },
    ],
  },
  {
    slug: 'leisure-culture',
    name: label(
      'Oci i cultura',
      'Ocio y cultura',
      'Leisure & Culture',
      'الترفيه والثقافة',
      'تفریح و فرهنگ',
    ),
    icon: 'tickets',
    color: 'primary',
    sortOrder: 70,
    fields: [
      {
        key: 'activity_type',
        label: label(
          'Tipus d’activitat',
          'Tipo de actividad',
          'Activity type',
          'نوع النشاط',
          'نوع فعالیت',
        ),
        type: 'select',
        required: true,
        filterable: true,
        options: ['sports', 'cultural', 'social', 'trips'],
      },
      {
        key: 'family_friendly',
        label: label(
          'Per a famílies',
          'Para familias',
          'Family friendly',
          'مناسب للعائلات',
          'مناسب خانواده',
        ),
        type: 'boolean',
        required: true,
        filterable: true,
      },
      {
        key: 'age_restriction',
        label: label('Edat mínima', 'Edad mínima', 'Minimum age', 'الحد الأدنى للعمر', 'حداقل سن'),
        type: 'number',
        required: false,
        filterable: true,
        minimum: 0,
      },
    ],
  },
  {
    slug: 'documentation',
    name: label(
      'Tràmits',
      'Trámites',
      'Documentation & Administrative',
      'الوثائق والإجراءات',
      'مدارک و امور اداری',
    ),
    icon: 'file-text',
    color: 'secondary',
    sortOrder: 80,
    fields: [
      {
        key: 'document_type',
        label: label(
          'Tipus de tràmit',
          'Tipo de trámite',
          'Document type',
          'نوع الإجراء',
          'نوع مدرک',
        ),
        type: 'select',
        required: true,
        filterable: true,
        options: ['empadronament', 'nie', 'tie', 'health_card', 'social_services', 'other'],
      },
      {
        key: 'appointment_required',
        label: label(
          'Cal cita',
          'Requiere cita',
          'Appointment required',
          'يتطلب موعداً',
          'نیاز به وقت قبلی',
        ),
        type: 'boolean',
        required: true,
        filterable: true,
      },
      {
        key: 'documents_needed',
        label: label(
          'Documents necessaris',
          'Documentos necesarios',
          'Documents needed',
          'المستندات المطلوبة',
          'مدارک مورد نیاز',
        ),
        type: 'text',
        required: false,
        filterable: false,
      },
      {
        key: 'languages_available',
        label: label(
          'Idiomes disponibles',
          'Idiomas disponibles',
          'Languages available',
          'اللغات المتاحة',
          'زبان‌های موجود',
        ),
        type: 'string-array',
        required: true,
        filterable: true,
        options: ['ca', 'es', 'en', 'ar', 'fa'],
      },
      {
        key: 'processing_time',
        label: label(
          'Temps de tramitació',
          'Tiempo de tramitación',
          'Processing time',
          'مدة المعالجة',
          'زمان پردازش',
        ),
        type: 'text',
        required: false,
        filterable: false,
      },
    ],
  },
] as const satisfies readonly ServiceCategoryDefinition[];

export type ServiceCategorySlug = (typeof SERVICE_CATEGORY_DEFINITIONS)[number]['slug'];

export const SERVICE_CATEGORY_SLUGS = SERVICE_CATEGORY_DEFINITIONS.map(({ slug }) => slug) as [
  ServiceCategorySlug,
  ...ServiceCategorySlug[],
];

function createFieldSchema(field: ServiceMetadataFieldDefinition): z.ZodType {
  let schema: z.ZodType;
  switch (field.type) {
    case 'select':
      schema = z.enum(field.options as [string, ...string[]]);
      break;
    case 'string-array':
      schema = z.array(z.enum(field.options as [string, ...string[]])).min(1);
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'number':
      schema = z
        .number()
        .finite()
        .min(field.minimum ?? Number.MIN_SAFE_INTEGER);
      break;
    case 'text':
      schema = z.string().trim().min(1).max(2_000);
      break;
    case 'date':
      schema = z.iso.date();
      break;
  }
  return field.required ? schema : schema.optional();
}

export interface ServiceCategoryContract {
  readonly definition: ServiceCategoryDefinition;
  readonly formFields: readonly ServiceMetadataFieldDefinition[];
  readonly filterFields: readonly ServiceMetadataFieldDefinition[];
  readonly metadataSchema: z.ZodObject<z.ZodRawShape>;
  readonly buildMetadataFilter: (
    values: Readonly<Record<string, unknown>>,
  ) => Record<string, unknown>;
}

export function createServiceCategoryContract(
  definition: ServiceCategoryDefinition,
): ServiceCategoryContract {
  const metadataShape = Object.fromEntries(
    definition.fields.map((field) => [field.key, createFieldSchema(field)]),
  ) as z.ZodRawShape;
  const filterFields = definition.fields.filter(({ filterable }) => filterable);
  const filterShape = Object.fromEntries(
    filterFields.map((field) => [field.key, createFieldSchema({ ...field, required: false })]),
  ) as z.ZodRawShape;
  const metadataSchema = z.object(metadataShape).strict();
  const metadataFilterSchema = z.object(filterShape).strict();

  return {
    definition,
    formFields: definition.fields,
    filterFields,
    metadataSchema,
    buildMetadataFilter(values) {
      return metadataFilterSchema.parse(values);
    },
  };
}

const contractsBySlug = new Map(
  SERVICE_CATEGORY_DEFINITIONS.map((definition) => [
    definition.slug,
    createServiceCategoryContract(definition),
  ]),
);

export function getServiceCategoryContract(slug: ServiceCategorySlug): ServiceCategoryContract {
  return contractsBySlug.get(slug)!;
}

export function serializeServiceCategoryMetadataSchema(
  definition: ServiceCategoryDefinition,
): Readonly<{ fields: readonly ServiceMetadataFieldDefinition[] }> {
  return { fields: definition.fields };
}
