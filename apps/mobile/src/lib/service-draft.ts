/**
 * A service being written on the phone (RAPP-344): the form kept on the
 * device through the shared draft store, and the step from the form to the
 * service the database stores, with the web admin's rules. The number fields
 * are kept as typed; the category's extra fields keep the values her answers
 * gave them. A photo that is not uploaded yet is not kept.
 *
 * Without `services.publish` the publication goes back as stored, as the
 * permission screen describes. A submission from an entity that staff save
 * here becomes a draft, as on the web admin.
 */
import { z } from 'zod';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import {
  normalizedServiceMetadata,
  SERVICE_AVAILABILITIES,
  SERVICE_COST_TYPES,
  serviceMetadataDefaults,
  type AdminServiceCategory,
  type AdminServiceDetail,
  type AdminServiceInput,
} from '@ramassa/shared/services';
import {
  isTranslationReviewPublishable,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { PUBLISH_MODES, type PublishMode } from './announcement-draft';
import { createDraftStore } from './content-draft';

const translationsSchema = z.record(z.string(), z.string());

const formImageSchema = z.object({
  key: z.string(),
  url: z.string().nullable(),
  alt: z.string(),
  altTranslations: translationsSchema.optional(),
});

export type FormImage = z.infer<typeof formImageSchema>;

const serviceDraftSchema = z.object({
  categoryId: z.string(),
  title: z.string(),
  description: z.string(),
  providerName: z.string(),
  location: z.string(),
  zone: z.string(),
  costType: z.enum(SERVICE_COST_TYPES),
  costAmount: z.string(),
  costDetails: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  contactEmail: z.string(),
  contactRole: z.string(),
  schedule: z.string(),
  externalUrl: z.string(),
  availability: z.enum(SERVICE_AVAILABILITIES),
  metadata: z.record(z.string(), z.unknown()),
  images: z.array(formImageSchema).max(12),
  mode: z.enum(PUBLISH_MODES),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  titleTranslations: translationsSchema.optional(),
  descriptionTranslations: translationsSchema.optional(),
});

export type ServiceDraft = z.infer<typeof serviceDraftSchema>;

const store = createDraftStore('service', serviceDraftSchema);

export const readServiceDraft = store.read;
export const writeServiceDraft = store.write;
export const clearServiceDraft = store.clear;

export const MAX_SERVICE_IMAGES = 12;

export function initialServiceMode(
  detail: AdminServiceDetail | undefined,
  now = new Date(),
): PublishMode {
  if (detail === undefined || detail.service.status !== 'published') return 'draft';
  return detail.service.published_at !== null &&
    new Date(detail.service.published_at).getTime() > now.getTime()
    ? 'scheduled'
    : 'now';
}

/** The form for a new service (first category) or a stored one. */
export function startingServiceDraft(
  detail: AdminServiceDetail | undefined,
  category: AdminServiceCategory | undefined,
  now = new Date(),
): ServiceDraft {
  const service = detail?.service;
  return {
    categoryId: service?.category_id ?? category?.id ?? '',
    title: service?.title.ca ?? '',
    description: service?.description?.ca ?? '',
    providerName: service?.provider_name ?? '',
    location: service?.location ?? '',
    zone: service?.zone ?? '',
    costType: service?.cost_type ?? 'free',
    costAmount: service?.cost_amount == null ? '' : String(service.cost_amount),
    costDetails: service?.cost_details ?? '',
    contactName: service?.contact_name ?? '',
    contactPhone: service?.contact_phone ?? '',
    contactEmail: service?.contact_email ?? '',
    contactRole: service?.contact_role ?? '',
    schedule: service?.schedule ?? '',
    externalUrl: service?.external_url ?? '',
    availability: service?.availability ?? 'available',
    metadata: category === undefined ? {} : serviceMetadataDefaults(category, service?.metadata),
    images: (detail?.images ?? []).map((image) => ({
      key: image.id,
      url: image.url,
      alt: image.alt_text.ca,
    })),
    mode: initialServiceMode(detail, now),
    publishedAt: service?.published_at ?? null,
    expiresAt: service?.expires_at ?? null,
  };
}

/** Another category asks other extra fields, so their answers start again. */
export function withCategory(form: ServiceDraft, category: AdminServiceCategory): ServiceDraft {
  return { ...form, categoryId: category.id, metadata: serviceMetadataDefaults(category) };
}

export function moveImage(
  images: readonly FormImage[],
  index: number,
  offset: -1 | 1,
): readonly FormImage[] {
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= images.length) return images;
  const next = [...images];
  [next[index], next[destination]] = [next[destination] as FormImage, next[index] as FormImage];
  return next;
}

/** True when saving would publish the service (or keep it published). */
export function isServicePublishing(
  form: ServiceDraft,
  detail: AdminServiceDetail | undefined,
  canPublish: boolean,
): boolean {
  return canPublish ? form.mode !== 'draft' : detail?.service.status === 'published';
}

export interface ServiceReviews {
  readonly title: TranslationReview | undefined;
  readonly description: TranslationReview | undefined;
  /** By image key. */
  readonly images: Readonly<Record<string, TranslationReview | undefined>>;
}

/** Every translation the service shows approved: what publishing needs. */
export function areServiceTranslationsApproved(
  form: ServiceDraft,
  reviews: ServiceReviews,
): boolean {
  const approved = (review: TranslationReview | undefined) =>
    review !== undefined && isTranslationReviewPublishable(review);
  return (
    approved(reviews.title) &&
    (form.description.trim().length === 0 || approved(reviews.description)) &&
    form.images.every((image) => approved(reviews.images[image.key]))
  );
}

const blankToNull = (value: string) => (value.trim().length === 0 ? null : value.trim());

function publicationTime(
  form: ServiceDraft,
  detail: AdminServiceDetail | undefined,
  now: Date,
): string | null {
  if (form.mode === 'draft') return null;
  if (form.mode === 'scheduled') return form.publishedAt;
  // Already live: keep the time it went out.
  const stored = detail?.service;
  if (
    stored?.status === 'published' &&
    stored.published_at !== null &&
    new Date(stored.published_at).getTime() <= now.getTime()
  ) {
    return stored.published_at;
  }
  return now.toISOString();
}

/**
 * The service to store; the category's input schema in the shared module
 * checks it. `imageUrls` holds the uploaded photos by image key.
 */
export function toServiceInput(
  form: ServiceDraft,
  reviews: ServiceReviews,
  context: {
    readonly category: AdminServiceCategory;
    readonly detail: AdminServiceDetail | undefined;
    readonly canPublish: boolean;
    readonly imageUrls?: Readonly<Record<string, string>>;
    readonly now?: Date;
  },
): AdminServiceInput {
  const now = context.now ?? new Date();
  const { category, detail, canPublish } = context;
  const stored = detail?.service;
  const publishing = isServicePublishing(form, detail, canPublish);
  const amount = form.costAmount.trim().replace(',', '.');
  return {
    categoryId: category.id,
    title: localizedTextFromReview(form.title, reviews.title),
    description:
      form.description.trim().length === 0
        ? null
        : localizedTextFromReview(form.description, reviews.description),
    providerName: blankToNull(form.providerName),
    location: blankToNull(form.location),
    zone: blankToNull(form.zone),
    costType: form.costType,
    costAmount: amount.length === 0 ? null : Number(amount),
    costDetails: blankToNull(form.costDetails),
    contactName: blankToNull(form.contactName),
    contactPhone: blankToNull(form.contactPhone),
    contactEmail: blankToNull(form.contactEmail),
    contactRole: blankToNull(form.contactRole),
    schedule: blankToNull(form.schedule),
    externalUrl: blankToNull(form.externalUrl),
    availability: form.availability,
    metadata: normalizedServiceMetadata(category, form.metadata),
    status: publishing ? 'published' : 'draft',
    publishedAt: canPublish
      ? publicationTime(form, detail, now)
      : stored?.status === 'published'
        ? stored.published_at
        : null,
    expiresAt: canPublish
      ? publishing
        ? form.expiresAt
        : null
      : stored?.status === 'published'
        ? stored.expires_at
        : null,
    images: form.images.map((image) => ({
      url: context.imageUrls?.[image.key] ?? image.url ?? '',
      altText: localizedTextFromReview(image.alt, reviews.images[image.key]),
    })),
  };
}
