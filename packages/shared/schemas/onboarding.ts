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
import type { IntakeQuestion } from '../onboarding/intake';
import {
  DEFAULT_REQUIRED_QUESTIONS,
  isRequiredQuestion,
  type RequiredQuestions,
} from '../onboarding/question-states';
import { languageCodeSchema } from './language';
import type { SeasonAnswerFields } from './season';

/**
 * Which questions need an answer is data (RAPP-611): staff choose per
 * organization, her first name, last name and app language always. Each step
 * is therefore an object of fields that judge a value only when one is given,
 * plus `requireAnswers`, which refuses a missing answer to a required
 * question. The default exports keep the app's own list.
 */
export type FieldQuestions = Readonly<Record<string, IntakeQuestion>>;

/** An answer was given: a value, "None" (null) where the step allows it, a non-empty list. */
function isGiven(value: unknown): boolean {
  if (value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * A refinement that adds the issue `required` on each field whose question is
 * required and has no answer. `null` counts as an answer ("None"); a field
 * that only applies after another answer says so through `appliesTo`.
 */
/**
 * Run the required check even when another field already failed, so every
 * missing answer is marked at once (https://zod.dev/api#refinements, `when`).
 */
export const ALWAYS_CHECK = { when: () => true } as const;

export function requireAnswers<T extends Record<string, unknown>>(
  fields: FieldQuestions,
  required: RequiredQuestions,
  appliesTo: (field: string, value: T) => boolean = () => true,
) {
  return (value: T, context: z.RefinementCtx): void => {
    for (const [field, question] of Object.entries(fields)) {
      if (!isRequiredQuestion(question, required) || !appliesTo(field, value)) continue;
      if (!isGiven(value[field])) {
        context.addIssue({ code: 'custom', path: [field], message: 'required' });
      }
    }
  };
}

/** Program constraint: younger players are staff-assisted edge cases with staff-created accounts. */
export const MINIMUM_AGE_YEARS = 16;
/** Generous input safeguard for birth-year mistakes, shared across identity forms. */
export const MAXIMUM_AGE_YEARS = 120;

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

/** A birth date: a real calendar day, not in the future, and an age the programme takes. */
export const birthDateSchema = z.string().superRefine((value, context) => {
  const birth = new Date(`${value}T00:00:00Z`);
  // Date parsing alone rolls e.g. 31 April into May. Require an exact round trip.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== value ||
    birth.getTime() > Date.now()
  ) {
    context.addIssue({ code: 'custom', message: 'invalid date' });
    return;
  }
  const age = ageInYears(value);
  if (age < MINIMUM_AGE_YEARS) context.addIssue({ code: 'custom', message: 'too young' });
  if (age > MAXIMUM_AGE_YEARS) context.addIssue({ code: 'custom', message: 'too old' });
});

/** An optional answer of free text: '' from an untouched input is no answer. */
function optionalTrimmed(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));
}

/**
 * Step 1 — Identitat, as fields. Her names and app language are always
 * required; her birth date, place of birth and nationality are required by
 * default (place of birth since 2026-07-31, Fabián) and staff may make them
 * optional (RAPP-611). A value given is always checked.
 */
export const identityFields = z.object({
  firstName: anyScriptName,
  lastName: anyScriptName,
  dateOfBirth: z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(birthDateSchema.optional()),
  placeOfBirth: optionalTrimmed(200),
  nationality: optionalTrimmed(100),
  preferredLanguage: languageCodeSchema,
});

export const IDENTITY_FIELD_QUESTIONS: FieldQuestions = {
  firstName: 'first_name',
  lastName: 'last_name',
  dateOfBirth: 'date_of_birth',
  placeOfBirth: 'place_of_birth',
  nationality: 'nationality',
  preferredLanguage: 'preferred_language',
};

export function identityStepSchemaFor(required: RequiredQuestions) {
  return identityFields.superRefine(
    requireAnswers(IDENTITY_FIELD_QUESTIONS, required),
    ALWAYS_CHECK,
  );
}

/** The identity step with the app's own required list. */
export const identityStepSchema = identityStepSchemaFor(DEFAULT_REQUIRED_QUESTIONS);
export type IdentityStep = z.infer<typeof identityFields>;

export const DOCUMENT_TYPES = ['nie', 'passport', 'other', 'none'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** NIE: one letter, seven digits, one letter (RAPP-4 spec wording, exactly). */
export const NIE_PATTERN = /^[A-Z]\d{7}[A-Z]$/;

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
  // Optional (RAPP-302): entities often hold back a woman's documents to
  // protect her, so the step can be skipped. Empty means "not given", which
  // is different from `none` ("I have no document").
  documentType: z.enum(DOCUMENT_TYPES).optional(),
  documentName: z
    .string()
    .trim()
    .max(100)
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
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
  step: { documentType?: DocumentType; documentNumber?: string },
  context: z.RefinementCtx,
): void {
  if (step.documentType === undefined || step.documentType === 'none') return;
  if (step.documentNumber === undefined) {
    if (step.documentType !== 'other')
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

export const DOCUMENTATION_FIELD_QUESTIONS: FieldQuestions = { documentType: 'document' };

/** The document step; staff may make the document required (RAPP-611): "none" is an answer. */
export function documentationStepSchemaFor(required: RequiredQuestions) {
  return documentationFields
    .superRefine(refineDocumentNumber)
    .superRefine(requireAnswers(DOCUMENTATION_FIELD_QUESTIONS, required), ALWAYS_CHECK);
}

export const documentationStepSchema = documentationStepSchemaFor(DEFAULT_REQUIRED_QUESTIONS);
export type DocumentationStep = z.infer<typeof documentationFields>;

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
 * Step 3 — Contacte i logística, as fields. `referenceEntity: null` is the
 * explicit "Cap / None" choice, distinct from the field being absent: when the
 * entity is required, the wizard requires an ANSWER, not an entity. A
 * dependants answer left out, or a size left out, is unknown (RAPP-611): only
 * a required question needs one.
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
  referenceEntity: z.string().trim().min(1).max(200).nullable().optional(),
  referenceContactName: optionalText,
  hasDependents: z.boolean().optional(),
  numDependents: z.number().int().min(0).max(15).optional().default(0),
  clothingSize: z
    .union([z.enum(CLOTHING_SIZES), z.literal('')])
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  shoeSize: z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .refine((value) => value === undefined || SHOE_SIZES.includes(value), {
      message: 'expected an EU size between 34 and 46',
    }),
  avatarUrl: z.url().optional(),
});

export const LOGISTICS_FIELD_QUESTIONS: FieldQuestions = {
  phone: 'phone',
  address: 'address',
  city: 'city',
  postalCode: 'postal_code',
  referenceEntity: 'reference_entity',
  referenceContactName: 'reference_contact_name',
  hasDependents: 'dependents',
  clothingSize: 'clothing_size',
  shoeSize: 'shoe_size',
};

/** Her contact at the entity is asked only once she names one. */
export function logisticsFieldApplies(
  field: string,
  value: { readonly referenceEntity?: string | null },
): boolean {
  return field !== 'referenceContactName' || typeof value.referenceEntity === 'string';
}

/** The dependants rule, shared by intake and by editing. */
export function refineDependents(
  step: { hasDependents?: boolean | null; numDependents: number },
  context: z.RefinementCtx,
): void {
  if (step.hasDependents === true && step.numDependents < 1) {
    context.addIssue({
      code: 'custom',
      path: ['numDependents'],
      message: 'how many, between 1 and 15',
    });
  }
}

/**
 * Without dependants (or with no answer) the count is FORCED to 0, so a
 * toggled-then-untoggled form cannot smuggle a stale count through. Exported
 * because the profile edit path has to apply the same normalization on its
 * way to the RPC.
 */
export function normalizeDependents<
  T extends { hasDependents?: boolean | null; numDependents: number },
>(step: T): T {
  return step.hasDependents === true ? step : { ...step, numDependents: 0 };
}

export function logisticsStepSchemaFor(required: RequiredQuestions) {
  return logisticsFields
    .superRefine(refineDependents)
    .superRefine(
      requireAnswers(LOGISTICS_FIELD_QUESTIONS, required, logisticsFieldApplies),
      ALWAYS_CHECK,
    )
    .transform(normalizeDependents);
}

export const logisticsStepSchema = logisticsStepSchemaFor(DEFAULT_REQUIRED_QUESTIONS);
export type LogisticsStep = z.infer<typeof logisticsStepSchema>;

/** The season screens' questions, all optional by default (RAPP-306, RAPP-611). */
export const SEASON_FIELD_QUESTIONS: FieldQuestions = {
  applicantStatus: 'applicant_status',
  supportingEntities: 'supporting_entities',
  childcareNeed: 'childcare_need',
  specificNeeds: 'specific_needs',
};

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
  /** The registration questions (RAPP-306), all optional. */
  season?: SeasonAnswerFields;
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
/** A number travels only with a type that takes one. */
export function documentNumberToSend(document: {
  readonly documentType?: DocumentType;
  readonly documentNumber?: string;
}): string | null {
  if (document.documentType === undefined || document.documentType === 'none') return null;
  return document.documentNumber ?? null;
}

export function documentNameToSend(document: {
  readonly documentType?: DocumentType;
  readonly documentName?: string;
}): string | null {
  return document.documentType === 'other' ? document.documentName?.trim() || null : null;
}

export function buildCompleteOnboardingPayload(steps: OnboardingSteps, terms: TermsContext) {
  return {
    first_name: steps.identity.firstName,
    last_name: steps.identity.lastName,
    // An optional answer she did not give travels as none (RAPP-611).
    date_of_birth: steps.identity.dateOfBirth ?? null,
    place_of_birth: steps.identity.placeOfBirth ?? null,
    nationality: steps.identity.nationality ?? null,
    preferred_language: steps.identity.preferredLanguage,
    document_type: steps.documentation.documentType ?? null,
    document_number: documentNumberToSend(steps.documentation),
    document_name: documentNameToSend(steps.documentation),
    phone: steps.logistics.phone ?? null,
    address: steps.logistics.address ?? null,
    city: steps.logistics.city ?? null,
    postal_code: steps.logistics.postalCode ?? null,
    // The entity travels only when answered: "None" is null, and a key left
    // out is no answer, so the server keeps what is stored (RAPP-611).
    ...(steps.logistics.referenceEntity === undefined
      ? {}
      : { reference_entity: steps.logistics.referenceEntity }),
    reference_contact_name: steps.logistics.referenceContactName ?? null,
    // No answer to dependants is unknown (null), never "no".
    has_dependents: steps.logistics.hasDependents ?? null,
    num_dependents: steps.logistics.numDependents,
    clothing_size: steps.logistics.clothingSize ?? null,
    shoe_size: steps.logistics.shoeSize ?? null,
    // The registration questions (RAPP-306), only when the screen was shown.
    ...(steps.season === undefined
      ? {}
      : {
          applicant_status: steps.season.applicantStatus ?? null,
          applicant_status_details:
            steps.season.applicantStatus === 'other'
              ? (steps.season.applicantStatusDetails ?? null)
              : null,
          supporting_entities:
            steps.season.supportingEntities === undefined ||
            steps.season.supportingEntities.length === 0
              ? null
              : steps.season.supportingEntities,
          childcare_need: steps.season.childcareNeed ?? null,
          specific_needs: steps.season.specificNeeds ?? null,
        }),
    media_consent: steps.terms.mediaConsent,
    terms_version: terms.termsVersion,
    locale_shown: terms.localeShown,
  };
}
export type CompleteOnboardingPayload = ReturnType<typeof buildCompleteOnboardingPayload>;
