import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from './errors';
import { eventCategoryNameSchema } from './events';
import type { Database } from './types/database';

type Client = SupabaseClient<Database>;

const nonNegativeInteger = z.number().int().nonnegative();
const percentage = z.number().min(0).max(100);

export const impactReportFiltersSchema = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    categoryId: z.uuid().optional(),
    collaboratingEntityId: z.uuid().optional(),
  })
  .refine(({ startDate, endDate }) => startDate <= endDate, {
    message: 'Start date must not be after end date',
    path: ['endDate'],
  });

const visibleSummarySchema = z.object({
  suppressed: z.literal(false),
  participant_count: nonNegativeInteger,
  active_participant_count: nonNegativeInteger,
  new_participant_count: nonNegativeInteger,
  participating_participant_count: nonNegativeInteger,
  attendance_present_count: nonNegativeInteger,
  attendance_eligible_count: nonNegativeInteger,
  attendance_marked_count: nonNegativeInteger,
  attendance_rate: percentage,
});

const suppressedSummarySchema = z.object({
  suppressed: z.literal(true),
});

const trendPointSchema = z.object({
  month_start: z.iso.date(),
  new_participant_count: nonNegativeInteger,
  participating_participant_count: nonNegativeInteger,
  attendance_present_count: nonNegativeInteger,
  attendance_eligible_count: nonNegativeInteger,
  attendance_marked_count: nonNegativeInteger,
  attendance_rate: percentage,
});

const categoryImpactSchema = z.object({
  category_id: z.uuid(),
  category_name: eventCategoryNameSchema,
  category_color: z.string().min(1),
  participant_count: nonNegativeInteger,
  attendance_present_count: nonNegativeInteger,
  attendance_eligible_count: nonNegativeInteger,
  attendance_marked_count: nonNegativeInteger,
  attendance_rate: percentage,
});

const visibleBucketSchema = z.object({
  label: z.string().min(1),
  suppressed: z.literal(false),
  count: nonNegativeInteger,
});

const suppressedBucketSchema = z.object({
  label: z.string().min(1),
  suppressed: z.literal(true),
});

const entityImpactSchema = z.discriminatedUnion('suppressed', [
  z.object({
    entity_id: z.uuid(),
    entity_name: z.string().min(1),
    suppressed: z.literal(false),
    participant_count: nonNegativeInteger,
    attendance_present_count: nonNegativeInteger,
    attendance_eligible_count: nonNegativeInteger,
    attendance_marked_count: nonNegativeInteger,
    attendance_rate: percentage,
  }),
  z.object({
    entity_id: z.uuid(),
    entity_name: z.string().min(1),
    suppressed: z.literal(true),
  }),
]);

const forumActivitySchema = z.discriminatedUnion('suppressed', [
  z.object({
    suppressed: z.literal(false),
    post_count: nonNegativeInteger,
    reply_count: nonNegativeInteger,
    contributor_count: nonNegativeInteger,
  }),
  z.object({ suppressed: z.literal(true) }),
]);

const referralImpactSchema = z.discriminatedUnion('suppressed', [
  z.object({
    suppressed: z.literal(false),
    referral_count: nonNegativeInteger,
    converted_count: nonNegativeInteger,
    conversion_rate: percentage,
  }),
  z.object({ suppressed: z.literal(true) }),
]);

const impactReportWireSchema = z.object({
  version: z.literal(1),
  period: z.object({
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    time_zone: z.literal('Europe/Madrid'),
  }),
  filters: z.object({
    category_id: z.uuid().optional(),
    collaborating_entity_id: z.uuid().optional(),
  }),
  available_filters: z.object({
    categories: z.array(z.object({ id: z.uuid(), name: eventCategoryNameSchema })),
    entities: z.array(z.object({ id: z.uuid(), name: z.string().min(1) })),
  }),
  summary: z.discriminatedUnion('suppressed', [visibleSummarySchema, suppressedSummarySchema]),
  participant_trend: z.array(trendPointSchema),
  categories: z.array(categoryImpactSchema),
  demographics: z.object({
    nationalities: z.array(
      z.discriminatedUnion('suppressed', [visibleBucketSchema, suppressedBucketSchema]),
    ),
    age_bands: z.array(
      z.discriminatedUnion('suppressed', [visibleBucketSchema, suppressedBucketSchema]),
    ),
  }),
  entities: z.array(entityImpactSchema),
  forum_activity: forumActivitySchema,
  referrals: referralImpactSchema,
});

function mapBucket(
  bucket: z.infer<typeof visibleBucketSchema> | z.infer<typeof suppressedBucketSchema>,
) {
  return bucket.suppressed
    ? { label: bucket.label, suppressed: true as const }
    : { label: bucket.label, suppressed: false as const, count: bucket.count };
}

export function parseImpactReport(input: unknown) {
  const report = impactReportWireSchema.parse(input);
  const summary = report.summary.suppressed
    ? { suppressed: true as const }
    : {
        suppressed: false as const,
        participantCount: report.summary.participant_count,
        activeParticipantCount: report.summary.active_participant_count,
        newParticipantCount: report.summary.new_participant_count,
        participatingParticipantCount: report.summary.participating_participant_count,
        attendancePresentCount: report.summary.attendance_present_count,
        attendanceEligibleCount: report.summary.attendance_eligible_count,
        attendanceMarkedCount: report.summary.attendance_marked_count,
        attendanceRate: report.summary.attendance_rate,
      };

  return {
    version: report.version,
    period: {
      startDate: report.period.start_date,
      endDate: report.period.end_date,
      timeZone: report.period.time_zone,
    },
    filters: {
      ...(report.filters.category_id === undefined
        ? {}
        : { categoryId: report.filters.category_id }),
      ...(report.filters.collaborating_entity_id === undefined
        ? {}
        : { collaboratingEntityId: report.filters.collaborating_entity_id }),
    },
    availableFilters: {
      categories: report.available_filters.categories,
      entities: report.available_filters.entities,
    },
    summary,
    participantTrend: report.participant_trend.map((point) => ({
      monthStart: point.month_start,
      newParticipantCount: point.new_participant_count,
      participatingParticipantCount: point.participating_participant_count,
      attendancePresentCount: point.attendance_present_count,
      attendanceEligibleCount: point.attendance_eligible_count,
      attendanceMarkedCount: point.attendance_marked_count,
      attendanceRate: point.attendance_rate,
    })),
    categories: report.categories.map((category) => ({
      categoryId: category.category_id,
      categoryName: category.category_name,
      categoryColor: category.category_color,
      participantCount: category.participant_count,
      attendancePresentCount: category.attendance_present_count,
      attendanceEligibleCount: category.attendance_eligible_count,
      attendanceMarkedCount: category.attendance_marked_count,
      attendanceRate: category.attendance_rate,
    })),
    demographics: {
      nationalities: report.demographics.nationalities.map(mapBucket),
      ageBands: report.demographics.age_bands.map(mapBucket),
    },
    entities: report.entities.map((entity) =>
      entity.suppressed
        ? {
            entityId: entity.entity_id,
            entityName: entity.entity_name,
            suppressed: true as const,
          }
        : {
            entityId: entity.entity_id,
            entityName: entity.entity_name,
            suppressed: false as const,
            participantCount: entity.participant_count,
            attendancePresentCount: entity.attendance_present_count,
            attendanceEligibleCount: entity.attendance_eligible_count,
            attendanceMarkedCount: entity.attendance_marked_count,
            attendanceRate: entity.attendance_rate,
          },
    ),
    forumActivity: report.forum_activity.suppressed
      ? { suppressed: true as const }
      : {
          suppressed: false as const,
          postCount: report.forum_activity.post_count,
          replyCount: report.forum_activity.reply_count,
          contributorCount: report.forum_activity.contributor_count,
        },
    referrals: report.referrals.suppressed
      ? { suppressed: true as const }
      : {
          suppressed: false as const,
          referralCount: report.referrals.referral_count,
          convertedCount: report.referrals.converted_count,
          conversionRate: report.referrals.conversion_rate,
        },
  };
}

export type ImpactReportFilters = z.infer<typeof impactReportFiltersSchema>;
export type ImpactReport = ReturnType<typeof parseImpactReport>;

export async function fetchImpactReport(
  client: Pick<Client, 'rpc'>,
  input: ImpactReportFilters,
): Promise<ImpactReport> {
  const filters = impactReportFiltersSchema.parse(input);
  const { data, error } = await client.rpc('get_impact_report', {
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_category_id: filters.categoryId ?? null,
    p_collaborating_entity_id: filters.collaboratingEntityId ?? null,
  } as never);
  if (error !== null) throw new AppError('DB-1', { message: error.message });
  return parseImpactReport(data);
}
