/**
 * The season registration answers that are not part of the wizard yet
 * (RAPP-303). The referring entity gives them on the referral, and they live on
 * her profile. Applicant status and specific needs are sensitive: encrypted,
 * and readable only with participants.view_sensitive.
 */
import { z } from 'zod';

export const APPLICANT_STATUSES = [
  'asylum_seeker',
  'refugee',
  'migrant',
  'other',
  'prefer_not_to_say',
] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export const CHILDCARE_NEEDS = ['yes', 'no', 'maybe'] as const;
export type ChildcareNeed = (typeof CHILDCARE_NEEDS)[number];

/** Which season of the programme this is for her: first to fifth. */
export const SEASON_NUMBERS = [1, 2, 3, 4, 5] as const;
export type SeasonNumber = (typeof SEASON_NUMBERS)[number];

export const SPECIFIC_NEEDS_MAX_LENGTH = 2000;
export const SUPPORTING_ENTITIES_MAX = 20;

/** An empty input is an absent answer, never an invalid one. */
const emptyAsAbsent = (value: unknown) => (value === '' || value === null ? undefined : value);

/**
 * The season answers as form fields, every one optional. Shared by her own
 * profile edit, the staff edit and the staff prefill of a woman who has not
 * joined, so one rule judges each answer everywhere.
 */
export const seasonAnswerFields = z.object({
  applicantStatus: z.preprocess(emptyAsAbsent, z.enum(APPLICANT_STATUSES).optional()),
  supportingEntities: z
    .array(z.string().trim().max(200))
    .max(SUPPORTING_ENTITIES_MAX)
    .optional()
    .transform((names) => names?.filter((name) => name.length > 0)),
  seasonNumber: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
    z.number().int().min(1).max(5).optional(),
  ),
  childcareNeed: z.preprocess(emptyAsAbsent, z.enum(CHILDCARE_NEEDS).optional()),
  specificNeeds: z.preprocess(
    emptyAsAbsent,
    z.string().trim().max(SPECIFIC_NEEDS_MAX_LENGTH).optional(),
  ),
});

export type SeasonAnswerFields = z.infer<typeof seasonAnswerFields>;

/** The database payload keys for the season answers; absent answers are sent empty. */
export function seasonAnswersPayload(values: Partial<SeasonAnswerFields>) {
  return {
    applicant_status: values.applicantStatus ?? null,
    supporting_entities:
      values.supportingEntities === undefined || values.supportingEntities.length === 0
        ? null
        : values.supportingEntities,
    season_number: values.seasonNumber ?? null,
    childcare_need: values.childcareNeed ?? null,
    specific_needs: values.specificNeeds ?? null,
  };
}
