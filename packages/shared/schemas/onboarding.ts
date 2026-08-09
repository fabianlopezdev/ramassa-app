/**
 * Onboarding step schemas (RAPP-21): the single validation source for the
 * wizard. The client parses each step for UX; `complete_onboarding` re-checks
 * the same rules server-side for security (CONVENTIONS rule 2). Field list,
 * optionality and encryption decisions are the RAPP-4 deliverable
 * (`onboarding-intake-schema` in the vault); nothing is collected that is not
 * in that document.
 *
 * Names deliberately accept ANY script. The people this app is for write
 * Arabic, Farsi and Cyrillic before Latin; a "letters only" pattern would
 * reject them by construction, so the only constraints are non-empty and a
 * sane length.
 */

import { z } from 'zod';
import { isCanonicalMunicipality } from '../i18n/municipalities';
import { languageCodeSchema } from './language';

/** Program constraint: younger players are staff-assisted edge cases with staff-created accounts. */
export const MINIMUM_AGE_YEARS = 16;

const NAME_MAX_LENGTH = 100;

/** A required human name in any script: trimmed, non-empty, bounded. */
const anyScriptName = z.string().trim().min(1).max(NAME_MAX_LENGTH);

/** Optional free text where '' from an untouched input means "not provided". */
const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const optionalMunicipality = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value))
  .refine((value) => value === undefined || isCanonicalMunicipality(value), {
    message: 'expected a canonical IDESCAT municipality',
  });

function ageInYears(isoDate: string): number {
  const birth = new Date(`${isoDate}T00:00:00Z`);
  const now = new Date();
  const age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

/** Step 1 — Identitat. */
export const identityStepSchema = z.object({
  firstName: anyScriptName,
  lastName: anyScriptName,
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), {
      message: 'invalid date',
    })
    .refine((value) => ageInYears(value) >= MINIMUM_AGE_YEARS, { message: 'too young' }),
  // Required since 2026-07-31 (Fabián): it was in Marc's kickoff field list,
  // and the optional marking was a minimization judgement, since reversed.
  placeOfBirth: z.string().trim().min(1).max(200),
  nationality: z.string().trim().min(1).max(100),
  preferredLanguage: languageCodeSchema,
});
export type IdentityStep = z.infer<typeof identityStepSchema>;

export const DOCUMENT_TYPES = ['nie', 'passport', 'other', 'none'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** NIE: one letter, seven digits, one letter (RAPP-4 spec wording, exactly). */
const NIE_PATTERN = /^[A-Z]\d{7}[A-Z]$/;

/**
 * Step 2 — Documentació. `none` is a first-class answer that never blocks
 * onboarding: many participants genuinely have no document, and the wizard
 * must not dead-end on the fact. The conditional requirement lives HERE so the
 * server re-validation enforces exactly what the form promised.
 */
/**
 * The documentation FIELDS, separate from the step schema built on them, so the
 * profile edit screen can compose the identical fields instead of re-declaring
 * them (RAPP-22). A second declaration is how "valid" quietly comes to mean two
 * different things for the same woman's NIE.
 */
export const documentationFields = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  documentNumber: z
    .string()
    .trim()
    .toUpperCase()
    .max(50)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
});

/** The conditional document rule, shared by intake and by editing. */
export function refineDocumentNumber(
  step: { documentType: DocumentType; documentNumber?: string },
  context: z.RefinementCtx,
): void {
  if (step.documentType === 'none') return;
  if (step.documentNumber === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['documentNumber'],
      message: 'required unless document type is none',
    });
    return;
  }
  if (step.documentType === 'nie' && !NIE_PATTERN.test(step.documentNumber)) {
    context.addIssue({
      code: 'custom',
      path: ['documentNumber'],
      message: 'a NIE is one letter, seven digits, one letter',
    });
  }
}

export const documentationStepSchema = documentationFields.superRefine(refineDocumentNumber);
export type DocumentationStep = z.infer<typeof documentationStepSchema>;

export const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type ClothingSize = (typeof CLOTHING_SIZES)[number];

/** EU 34–46, as strings because they are labels on buttons, not arithmetic. */
export const SHOE_SIZES = Array.from({ length: 13 }, (_unused, index) =>
  String(34 + index),
) as readonly string[];

/**
 * A phone in E.164 after stripping the separators people actually type.
 * Optional at the field level (some players have no phone), so an empty string
 * from an untouched input reads as absent rather than invalid.
 */
const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    value === '' || value === undefined ? undefined : value.replace(/[\s\-.()]/g, ''),
  )
  .refine((value) => value === undefined || /^\+[1-9]\d{7,14}$/.test(value), {
    message: 'expected an international number like +34 600 111 222',
  });

/**
 * Step 3 — Contacte i logística. `referenceEntity: null` is the explicit
 * "Cap / None" choice, distinct from the field being absent: the wizard
 * requires an ANSWER, not an entity.
 */
export const logisticsFields = z.object({
  phone: optionalPhone,
  address: optionalText,
  city: optionalMunicipality,
  postalCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || /^\d{5}$/.test(value), {
      message: 'a postal code is five digits',
    }),
  referenceEntity: z.string().trim().min(1).max(200).nullable(),
  referenceContactName: optionalText,
  hasDependents: z.boolean(),
  numDependents: z.number().int().min(0).max(15).optional().default(0),
  clothingSize: z.enum(CLOTHING_SIZES),
  shoeSize: z.string().refine((value) => SHOE_SIZES.includes(value), {
    message: 'expected an EU size between 34 and 46',
  }),
  avatarUrl: z.url().optional(),
});

/** The dependants rule, shared by intake and by editing. */
export function refineDependents(
  step: { hasDependents: boolean; numDependents: number },
  context: z.RefinementCtx,
): void {
  if (step.hasDependents && step.numDependents < 1) {
    context.addIssue({
      code: 'custom',
      path: ['numDependents'],
      message: 'how many, between 1 and 15',
    });
  }
}

/**
 * Without dependants the count is FORCED to 0, so a toggled-then-untoggled form
 * cannot smuggle a stale count through. Exported because the profile edit path
 * has to apply the same normalization on its way to the RPC.
 */
export function normalizeDependents<T extends { hasDependents: boolean; numDependents: number }>(
  step: T,
): T {
  return step.hasDependents ? step : { ...step, numDependents: 0 };
}

export const logisticsStepSchema = logisticsFields
  .superRefine(refineDependents)
  .transform(normalizeDependents);
export type LogisticsStep = z.infer<typeof logisticsStepSchema>;

/**
 * Step 4 — Termes. Acceptance must be literally true (RGPD: silence is not
 * consent), and media consent is a separate, optional, revocable grant that
 * defaults to NOT given.
 */
export const termsStepSchema = z.object({
  termsAccepted: z.literal(true),
  mediaConsent: z.boolean().optional().default(false),
});
export type TermsStep = z.infer<typeof termsStepSchema>;

export interface OnboardingSteps {
  identity: IdentityStep;
  documentation: DocumentationStep;
  logistics: LogisticsStep;
  terms: TermsStep;
}

export interface TermsContext {
  termsVersion: string;
  localeShown: z.infer<typeof languageCodeSchema>;
}

/**
 * The exact snake_case payload `public.complete_onboarding(jsonb)` reads.
 * Centralized here because no type checker crosses the SQL boundary: a
 * mistyped key would silently become a NULL column, and this mapper plus its
 * test are the only guard.
 */
export function buildCompleteOnboardingPayload(steps: OnboardingSteps, terms: TermsContext) {
  return {
    first_name: steps.identity.firstName,
    last_name: steps.identity.lastName,
    date_of_birth: steps.identity.dateOfBirth,
    place_of_birth: steps.identity.placeOfBirth,
    nationality: steps.identity.nationality,
    preferred_language: steps.identity.preferredLanguage,
    document_type: steps.documentation.documentType,
    document_number: steps.documentation.documentNumber ?? null,
    phone: steps.logistics.phone ?? null,
    address: steps.logistics.address ?? null,
    city: steps.logistics.city ?? null,
    postal_code: steps.logistics.postalCode ?? null,
    reference_entity: steps.logistics.referenceEntity,
    reference_contact_name: steps.logistics.referenceContactName ?? null,
    has_dependents: steps.logistics.hasDependents,
    num_dependents: steps.logistics.numDependents,
    clothing_size: steps.logistics.clothingSize,
    shoe_size: steps.logistics.shoeSize,
    media_consent: steps.terms.mediaConsent,
    terms_version: terms.termsVersion,
    locale_shown: terms.localeShown,
  };
}
export type CompleteOnboardingPayload = ReturnType<typeof buildCompleteOnboardingPayload>;
