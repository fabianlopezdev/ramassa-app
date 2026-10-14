/**
 * A service category being edited on the phone (RAPP-347): its name, slug,
 * icon and colour, and the schema of its extra fields, field by field. The web
 * admin edits that schema as JSON text; the phone edits each field with
 * controls, and both store the same shape (`serviceMetadataSchemaDefinitionSchema`).
 *
 * A field's key is what services store their answer under, so a stored
 * field keeps its key; only a new field gets a key from its Catalan label.
 * Labels need all five languages, as players read them.
 */
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import {
  serviceCategoryInputSchema,
  serviceMetadataFieldDefinitionSchema,
  type AdminServiceCategory,
  type ServiceCategoryInput,
  type ServiceMetadataFieldType,
} from '@ramassa/shared/services';
import type { TranslationReview } from '@ramassa/shared/translation';

export const SERVICE_CATEGORY_ICONS = [
  'house',
  'languages',
  'briefcase-business',
  'scale',
  'heart-pulse',
  'graduation-cap',
  'tickets',
  'file-text',
  'circle',
] as const;

export const SERVICE_CATEGORY_COLORS = [
  'primary',
  'secondary',
  'accent',
  'chart-1',
  'chart-2',
  'chart-3',
] as const;

export interface FormField {
  /** Stable while editing; the stored key for a stored field. */
  readonly id: string;
  readonly key: string;
  /** True for a field from the stored schema: its key cannot change. */
  readonly isStored: boolean;
  readonly label: string;
  /** The stored label in every language, for its review. */
  readonly storedLabel: Readonly<Record<string, string>> | null;
  readonly type: ServiceMetadataFieldType;
  readonly required: boolean;
  readonly filterable: boolean;
  readonly options: readonly string[];
  /** Kept as typed. */
  readonly minimum: string;
}

export interface CategoryForm {
  readonly name: string;
  readonly slug: string;
  readonly icon: string;
  readonly color: string;
  readonly fields: readonly FormField[];
}

const DIACRITICS = /[̀-ͯ]/g;

/** A label as a slug: lower case, no accents, words joined by `separator`. */
function asciiWords(text: string, separator: '-' | '_'): string {
  return text
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, 'g'), '');
}

export function slugFromName(name: string): string {
  return asciiWords(name, '-');
}

/** A field key from its label: starts with a letter, as the schema requires. */
export function keyFromLabel(label: string): string {
  const words = asciiWords(label, '_');
  return /^[a-z]/.test(words) ? words : `field_${words}`.replace(/_+$/, '');
}

let fieldCounter = 0;

export function emptyField(): FormField {
  fieldCounter += 1;
  return {
    id: `new-${fieldCounter}`,
    key: '',
    isStored: false,
    label: '',
    storedLabel: null,
    type: 'text',
    required: false,
    filterable: false,
    options: [],
    minimum: '',
  };
}

export function startingCategoryForm(category: AdminServiceCategory | undefined): CategoryForm {
  return {
    name: category?.name.ca ?? '',
    slug: category?.slug ?? '',
    icon: category?.icon ?? 'circle',
    color: category?.color ?? 'primary',
    fields: (category?.metadataSchema.fields ?? []).map((field) => ({
      id: field.key,
      key: field.key,
      isStored: true,
      label: field.label.ca,
      storedLabel: field.label,
      type: field.type,
      required: field.required,
      filterable: field.filterable,
      options: field.options ?? [],
      minimum: field.minimum === undefined ? '' : String(field.minimum),
    })),
  };
}

export function moveField(
  fields: readonly FormField[],
  index: number,
  offset: -1 | 1,
): readonly FormField[] {
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= fields.length) return fields;
  const next = [...fields];
  [next[index], next[destination]] = [next[destination] as FormField, next[index] as FormField];
  return next;
}

/** The field's key: the stored one, the typed one, or one from the label. */
export function fieldKey(field: FormField): string {
  if (field.isStored || field.key.trim().length > 0) return field.key.trim();
  return keyFromLabel(field.label);
}

const usesOptions = (type: ServiceMetadataFieldType) =>
  type === 'select' || type === 'string-array';

/** True for a stored field whose Catalan label is unchanged: its stored languages stand. */
export function keepsStoredLabel(field: FormField): boolean {
  return field.storedLabel !== null && field.label.trim() === field.storedLabel.ca;
}

/**
 * A field as the stored definition; the shared schema checks it. An unchanged
 * stored label keeps its five languages, so editing a category does not ask
 * for every label to be approved again.
 */
function toFieldDefinition(field: FormField, review: TranslationReview | undefined) {
  const minimum = field.minimum.trim().replace(',', '.');
  return {
    key: fieldKey(field),
    label:
      review === undefined && keepsStoredLabel(field) && field.storedLabel !== null
        ? field.storedLabel
        : localizedTextFromReview(field.label, review),
    type: field.type,
    required: field.required,
    filterable: field.filterable,
    ...(usesOptions(field.type)
      ? { options: field.options.map((option) => option.trim()).filter(Boolean) }
      : {}),
    ...(field.type === 'number' && minimum.length > 0 ? { minimum: Number(minimum) } : {}),
  };
}

export function isFieldValid(field: FormField, review: TranslationReview | undefined): boolean {
  return serviceMetadataFieldDefinitionSchema.safeParse(toFieldDefinition(field, review)).success;
}

/** The category to store; `serviceCategoryInputSchema` in the shared module checks it. */
export function toCategoryInput(
  form: CategoryForm,
  reviews: {
    readonly name: TranslationReview | undefined;
    /** By field id. */
    readonly fields: Readonly<Record<string, TranslationReview | undefined>>;
  },
): ServiceCategoryInput {
  return {
    name: localizedTextFromReview(form.name, reviews.name) as ServiceCategoryInput['name'],
    slug: form.slug.trim(),
    icon: form.icon,
    color: form.color,
    metadataSchema: {
      fields: form.fields.map((field) =>
        toFieldDefinition(field, reviews.fields[field.id]),
      ) as ServiceCategoryInput['metadataSchema']['fields'],
    },
  };
}

export function isCategoryInputValid(input: ServiceCategoryInput): boolean {
  return serviceCategoryInputSchema.safeParse(input).success;
}
