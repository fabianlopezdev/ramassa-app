/**
 * Form-side schemas for the onboarding wizard (RAPP-21). Pure module: no
 * React, no React Native, so bun tests run it directly.
 *
 * The shared step schemas (`@ramassa/shared/schemas`) stay the single source
 * of truth for WHAT is valid; these wrap them with the shape a low-literacy
 * FORM needs. The one real difference is the date of birth: a single ISO
 * string is hostile to type on a phone, so the form asks day / month / year as
 * three numeric fields and pipes the composed date through the shared rule,
 * meaning the age gate lives in exactly one place.
 */

import { z } from 'zod';
import {
  DEFAULT_REQUIRED_QUESTIONS,
  isRequiredQuestion,
  type RequiredQuestions,
} from '@ramassa/shared/intake';
import {
  ALWAYS_CHECK,
  birthDateSchema,
  documentationStepSchemaFor,
  identityFields,
  identityStepSchemaFor,
  LOGISTICS_FIELD_QUESTIONS,
  logisticsFieldApplies,
  logisticsFields,
  logisticsStepSchemaFor,
  MAXIMUM_AGE_YEARS,
  normalizeDependents,
  refineDependents,
  requireAnswers,
} from '@ramassa/shared/schemas';

const ARABIC_DECIMAL_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DECIMAL_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const LOCALIZED_DECIMAL_DIGITS = /[٠-٩۰-۹]/g;

/** Keyboard digit glyphs change, but the stored date and count stay canonical. */
export function normalizeDecimalDigits(value: string): string {
  return value.replace(LOCALIZED_DECIMAL_DIGITS, (digit) => {
    const arabic = ARABIC_DECIMAL_DIGITS.indexOf(digit);
    return String(arabic === -1 ? PERSIAN_DECIMAL_DIGITS.indexOf(digit) : arabic);
  });
}

/** '7' becomes '07'; non-numeric input still fails the shared schema. */
export function composeIsoBirthDate(day: string, month: string, year: string): string {
  return `${normalizeDecimalDigits(year.trim())}-${normalizeDecimalDigits(month.trim()).padStart(2, '0')}-${normalizeDecimalDigits(day.trim()).padStart(2, '0')}`;
}

/**
 * The welcome screen deliberately asks only for the person's name. The rest
 * of the identity record is collected on the following background screen.
 */
export const identityNameFormSchema = identityFields.pick({
  firstName: true,
  lastName: true,
});
export type IdentityNameFormInput = z.input<typeof identityNameFormSchema>;

const decimalInputSchema = z.string().trim().transform(normalizeDecimalDigits);
const birthDayInputSchema = decimalInputSchema.pipe(
  z
    .string()
    .min(1, 'required')
    .refine(
      (value) =>
        value === '' || (/^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 31),
      'invalid date',
    ),
);
const birthMonthInputSchema = decimalInputSchema.pipe(
  z
    .string()
    .min(1, 'required')
    .refine(
      (value) =>
        value === '' || (/^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 12),
      'invalid date',
    ),
);
const birthYearInputSchema = decimalInputSchema.pipe(
  z
    .string()
    .min(1, 'required')
    .refine((value) => value === '' || /^\d{4}$/.test(value), 'invalid date')
    .superRefine((value, context) => {
      if (!/^\d{4}$/.test(value)) return;
      const currentYear = new Date().getUTCFullYear();
      if (Number(value) > currentYear) context.addIssue({ code: 'custom', message: 'future date' });
      // The exact birthday still comes from the shared schema once all parts are valid.
      if (Number(value) < currentYear - MAXIMUM_AGE_YEARS - 1)
        context.addIssue({ code: 'custom', message: 'too old' });
    }),
);

export type BirthDateField = 'day' | 'month' | 'year';

/** Each field gets its own translated instruction and accessibility hint. */
export function birthDateErrorKey(field: BirthDateField, message: string | undefined) {
  if (message === undefined) return undefined;
  if (message === 'required')
    return (
      {
        day: 'errorBirthDayRequired',
        month: 'errorBirthMonthRequired',
        year: 'errorBirthYearRequired',
      } as const
    )[field];
  if (message === 'too old') return 'errorBirthYear';
  if (message === 'too young') return 'errorTooYoung';
  if (message === 'future date') return 'errorBirthDateFuture';
  if (message === 'day not in month') return 'errorBirthDayInMonth';
  return (
    {
      day: 'errorBirthDayRange',
      month: 'errorBirthMonthRange',
      year: 'errorBirthYearFormat',
    } as const
  )[field];
}

/** Whether she typed any part of her birth date: none at all is no answer. */
function hasBirthDateParts(form: { day?: string; month?: string; year?: string }): boolean {
  return [form.day, form.month, form.year].some((part) => (part ?? '').trim() !== '');
}

/**
 * The shared schema judges the date; this adapter attaches feedback to the
 * part to fix. Her birth date is required unless staff made it optional
 * (RAPP-611): then all three parts left empty are no answer, and a date she
 * starts is still checked whole.
 */
export function identityFormSchemaFor(required: RequiredQuestions) {
  const isBirthDateRequired = isRequiredQuestion('date_of_birth', required);
  const part = decimalInputSchema.optional().default('');
  return identityFields
    .omit({ dateOfBirth: true })
    .extend({ day: part, month: part, year: part })
    .superRefine((form, context) => {
      if (!isBirthDateRequired && !hasBirthDateParts(form)) return;
      const parts = [
        ['day', birthDayInputSchema],
        ['month', birthMonthInputSchema],
        ['year', birthYearInputSchema],
      ] as const;
      let partsValid = true;
      for (const [field, schema] of parts) {
        const result = schema.safeParse(form[field]);
        if (!result.success) {
          partsValid = false;
          context.addIssue({
            code: 'custom',
            path: [field],
            message: result.error.issues[0]?.message ?? 'invalid date',
          });
        }
      }
      if (!partsValid) return;
      const iso = composeIsoBirthDate(form.day, form.month, form.year);
      const result = birthDateSchema.safeParse(iso);
      if (!result.success) {
        let message = result.error.issues[0]?.message ?? 'invalid date';
        let field: BirthDateField = 'year';
        if (message === 'invalid date') {
          const birth = new Date(`${iso}T00:00:00Z`);
          if (birth.getTime() > Date.now() && birth.toISOString().slice(0, 10) === iso) {
            message = 'future date';
            const now = new Date();
            field = Number(form.month) > now.getUTCMonth() + 1 ? 'month' : 'day';
          } else {
            message = 'day not in month';
            field = 'day';
          }
        }
        context.addIssue({ code: 'custom', path: [field], message });
      }
    }, ALWAYS_CHECK)
    .transform((form): z.input<typeof identityFields> => ({
      firstName: form.firstName,
      lastName: form.lastName,
      dateOfBirth: hasBirthDateParts(form)
        ? composeIsoBirthDate(form.day, form.month, form.year)
        : undefined,
      placeOfBirth: form.placeOfBirth,
      nationality: form.nationality,
      preferredLanguage: form.preferredLanguage,
    }))
    .pipe(identityStepSchemaFor(required));
}

/** Her identity with the app's own required list. */
export const identityFormSchema = identityFormSchemaFor(DEFAULT_REQUIRED_QUESTIONS);
export type IdentityFormInput = z.input<typeof identityFormSchema>;

/**
 * The logistics screen's form fields as they arrive from the inputs: text,
 * the dependants count as typed, and the yes/no choices unset (null) until
 * she taps one.
 */
const logisticsFormFields = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  referenceEntity: z.string().nullable().optional(),
  referenceContactName: z.string().optional(),
  hasDependents: z.boolean().nullable().optional(),
  numDependents: z.string().optional(),
  clothingSize: z.string().optional(),
  shoeSize: z.string().optional(),
});

function dependentsCount(numDependents: string | undefined): number {
  return numDependents === undefined || numDependents.trim() === ''
    ? 0
    : Number(normalizeDecimalDigits(numDependents));
}

/**
 * Her entity answer: "None" (null) when she said no, the name she typed after
 * yes, and no answer at all (undefined) when she chose neither. On the screen
 * that asks it, only her choice answers: a suggested name does not (RAPP-25).
 * Elsewhere (her draft re-checked later) a name staff gave her stays her
 * answer.
 */
function entityAnswer(
  form: {
    readonly hasReferenceEntity?: boolean | null;
    readonly referenceEntity?: string | null;
  },
  isAskedHere: boolean,
): string | null | undefined {
  if (form.hasReferenceEntity === false) return null;
  if (form.hasReferenceEntity === true) return form.referenceEntity ?? '';
  if (isAskedHere) return undefined;
  if (form.referenceEntity === null) return null;
  return form.referenceEntity?.trim() ? form.referenceEntity : undefined;
}

/** The contact screen's fields (the sizes have their own screen). */
const contactFields = logisticsFields.omit({ clothingSize: true, shoeSize: true });

/** The questions of the fields a schema holds, so one screen never asks another's. */
function questionsOf(fields: readonly string[]) {
  return Object.fromEntries(
    Object.entries(LOGISTICS_FIELD_QUESTIONS).filter(([field]) => fields.includes(field)),
  );
}
const CONTACT_QUESTIONS = questionsOf(Object.keys(contactFields.shape));
const EQUIPMENT_QUESTIONS = questionsOf(['clothingSize', 'shoeSize']);

/**
 * The contact screen: the shared fields, with the questions staff made
 * required (RAPP-611) refused when unanswered.
 */
export function contactFormSchemaFor(required: RequiredQuestions, isEntityAskedHere = false) {
  return logisticsFormFields
    .omit({ clothingSize: true, shoeSize: true })
    .extend({ hasReferenceEntity: z.boolean().nullable().optional() })
    .superRefine((form, ctx) => {
      if (form.hasReferenceEntity === true && !form.referenceEntity?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['referenceEntity'],
          message: 'referenceEntityRequired',
        });
      }
    })
    .transform((form): z.input<typeof contactFields> => ({
      phone: form.phone,
      address: form.address,
      city: form.city,
      postalCode: form.postalCode,
      referenceContactName: form.hasReferenceEntity === false ? '' : form.referenceContactName,
      referenceEntity: entityAnswer(form, isEntityAskedHere),
      hasDependents: form.hasDependents ?? undefined,
      numDependents: dependentsCount(form.numDependents),
    }))
    .pipe(
      contactFields
        .superRefine(refineDependents)
        .superRefine(
          requireAnswers(CONTACT_QUESTIONS, required, logisticsFieldApplies),
          ALWAYS_CHECK,
        )
        .transform(normalizeDependents),
    );
}
export const contactFormSchema = contactFormSchemaFor(DEFAULT_REQUIRED_QUESTIONS);
export type ContactFormInput = z.input<typeof contactFormSchema>;
export type ContactFormValue = z.output<typeof contactFormSchema>;

/** The sizes screen: a size left out is unknown unless staff made it required (RAPP-611). */
export function equipmentFormSchemaFor(required: RequiredQuestions) {
  return logisticsFormFields
    .pick({ clothingSize: true, shoeSize: true })
    .pipe(
      logisticsFields
        .pick({ clothingSize: true, shoeSize: true })
        .superRefine(requireAnswers(EQUIPMENT_QUESTIONS, required), ALWAYS_CHECK),
    );
}
export const equipmentFormSchema = equipmentFormSchemaFor(DEFAULT_REQUIRED_QUESTIONS);
export type EquipmentFormInput = z.input<typeof equipmentFormSchema>;
export type EquipmentFormValue = z.output<typeof equipmentFormSchema>;

/**
 * The whole logistics answer the terms step re-checks before sending: the
 * contact and the sizes, from the same draft section, with the same list.
 */
export function logisticsFormSchemaFor(required: RequiredQuestions) {
  return logisticsFormFields
    .extend({ hasReferenceEntity: z.boolean().nullable().optional() })
    .transform((form): z.input<typeof logisticsFields> => ({
      phone: form.phone,
      address: form.address,
      city: form.city,
      postalCode: form.postalCode,
      referenceContactName: form.hasReferenceEntity === false ? '' : form.referenceContactName,
      referenceEntity: entityAnswer(form, false),
      hasDependents: form.hasDependents ?? undefined,
      numDependents: dependentsCount(form.numDependents),
      // Free strings until a chip is chosen ('' is the unchosen state),
      // narrowed only for the type: the pipe validates them for real.
      clothingSize: form.clothingSize as z.input<typeof logisticsFields>['clothingSize'],
      shoeSize: form.shoeSize,
      avatarUrl: undefined,
    }))
    .pipe(logisticsStepSchemaFor(required));
}
export const logisticsFormSchema = logisticsFormSchemaFor(DEFAULT_REQUIRED_QUESTIONS);

/** The document step: "Not now" is no answer, refused when staff made the document required. */
export function documentationFormSchemaFor(required: RequiredQuestions) {
  return documentationStepSchemaFor(required);
}
