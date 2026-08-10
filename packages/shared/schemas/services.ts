import { z } from 'zod';
import { getServiceCategoryContract, SERVICE_CATEGORY_SLUGS } from '../services/definitions';
import { SERVICE_AVAILABILITIES, SERVICE_COST_TYPES } from '../services/filters';
import { SERVICE_SUBMISSION_STATUSES } from '../services/state-machine';
import { localizedTextSchema } from './localized-text';

export const serviceInputSchema = z
  .object({
    categorySlug: z.enum(SERVICE_CATEGORY_SLUGS),
    title: localizedTextSchema,
    description: localizedTextSchema.nullable(),
    providerName: z.string().trim().min(1).max(200).nullable(),
    location: z.string().trim().min(1).max(500).nullable(),
    zone: z.string().trim().min(1).max(200).nullable(),
    costType: z.enum(SERVICE_COST_TYPES),
    costAmount: z.number().finite().nonnegative().nullable(),
    costDetails: z.string().trim().min(1).max(1_000).nullable(),
    contactName: z.string().trim().min(1).max(200).nullable(),
    contactPhone: z.string().trim().min(1).max(50).nullable(),
    contactEmail: z.email().nullable(),
    contactRole: z.string().trim().min(1).max(200).nullable(),
    schedule: z.string().trim().min(1).max(1_000).nullable(),
    externalUrl: z
      .url()
      .refine((url) => url.startsWith('https://'))
      .nullable(),
    availability: z.enum(SERVICE_AVAILABILITIES),
    metadata: z.record(z.string(), z.unknown()),
    status: z.enum(SERVICE_SUBMISSION_STATUSES),
    publishedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
  })
  .superRefine((service, context) => {
    const metadataResult = getServiceCategoryContract(
      service.categorySlug,
    ).metadataSchema.safeParse(service.metadata);
    if (!metadataResult.success) {
      for (const issue of metadataResult.error.issues) {
        context.addIssue({
          code: 'custom',
          path: ['metadata', ...issue.path],
          message: issue.message,
        });
      }
    }

    if (service.costType === 'free' && service.costAmount !== null) {
      context.addIssue({
        code: 'custom',
        path: ['costAmount'],
        message: 'A free service cannot have a cost amount',
      });
    }
    if (
      (service.costType === 'paid' || service.costType === 'subsidized') &&
      service.costAmount === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['costAmount'],
        message: 'Paid and subsidized services require a cost amount',
      });
    }
    if (service.status === 'published' && service.publishedAt === null) {
      context.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'Published services require a publication time',
      });
    }
    if (
      service.expiresAt !== null &&
      (service.publishedAt === null ||
        new Date(service.expiresAt).getTime() <= new Date(service.publishedAt).getTime())
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Expiry must be later than publication',
      });
    }
  });

export type ServiceInput = z.infer<typeof serviceInputSchema>;
