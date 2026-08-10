import { z } from 'zod';

export const SERVICE_SUBMISSION_STATUSES = [
  'draft',
  'pending',
  'approved',
  'rejected',
  'published',
] as const;

export type ServiceSubmissionStatus = (typeof SERVICE_SUBMISSION_STATUSES)[number];

export const SERVICE_STATUS_TRANSITIONS: Readonly<
  Record<ServiceSubmissionStatus, readonly ServiceSubmissionStatus[]>
> = {
  draft: ['pending', 'published'],
  pending: ['approved', 'rejected'],
  approved: ['published', 'rejected'],
  rejected: ['draft', 'pending'],
  published: ['draft'],
};

export function canTransitionServiceStatus(
  from: ServiceSubmissionStatus,
  to: ServiceSubmissionStatus,
): boolean {
  return SERVICE_STATUS_TRANSITIONS[from].includes(to);
}

export const serviceStatusTransitionSchema = z
  .object({
    from: z.enum(SERVICE_SUBMISSION_STATUSES),
    to: z.enum(SERVICE_SUBMISSION_STATUSES),
  })
  .refine(({ from, to }) => canTransitionServiceStatus(from, to), {
    path: ['to'],
    message: 'Invalid service status transition',
  });
