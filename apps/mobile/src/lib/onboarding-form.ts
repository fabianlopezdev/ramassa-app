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
  documentationStepSchema,
  identityStepSchema,
  logisticsFields,
  logisticsStepSchema,
  MAXIMUM_AGE_YEARS,
  normalizeDependents,
  refineDependents,
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
export const identityNameFormSchema = identityStepSchema.pick({
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

/** The shared schema judges the date; this adapter attaches feedback to the part to fix. */
export const identityFormSchema = identityStepSchema
  .omit({ dateOfBirth: true })
  .extend({ day: birthDayInputSchema, month: birthMonthInputSchema, year: birthYearInputSchema })
  .superRefine((form, context) => {
    if (
      !birthDayInputSchema.safeParse(form.day).success ||
      !birthMonthInputSchema.safeParse(form.month).success ||
      !birthYearInputSchema.safeParse(form.year).success
    )
      return;
    const iso = composeIsoBirthDate(form.day, form.month, form.year);
    const result = identityStepSchema.shape.dateOfBirth.safeParse(iso);
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
  })

  .transform((form): z.input<typeof identityStepSchema> => ({
    firstName: form.firstName,
    lastName: form.lastName,
    dateOfBirth: composeIsoBirthDate(form.day, form.month, form.year),
    placeOfBirth: form.placeOfBirth,
    nationality: form.nationality,
    preferredLanguage: form.preferredLanguage,
  }))
  .pipe(identityStepSchema);
export type IdentityFormInput = z.input<typeof identityFormSchema>;

/**
 * The logistics screen's form: the shared schema, with the dependents count
 * typed as it arrives from a TextInput (a string) and converted before the
 * shared rule judges it.
 */
const logisticsFormFields = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  referenceEntity: z.string().nullable(),
  referenceContactName: z.string().optional(),
  hasDependents: z.boolean(),
  numDependents: z.string().optional(),
  clothingSize: z.string(),
  shoeSize: z.string(),
});

export const logisticsFormSchema = logisticsFormFields
  .transform((form): z.input<typeof logisticsStepSchema> => ({
    phone: form.phone,
    address: form.address,
    city: form.city,
    postalCode: form.postalCode,
    referenceEntity:
      form.referenceEntity === null || form.referenceEntity.trim() === ''
        ? null
        : form.referenceEntity,
    referenceContactName: form.referenceContactName,
    hasDependents: form.hasDependents,
    numDependents:
      form.numDependents === undefined || form.numDependents.trim() === ''
        ? 0
        : Number(normalizeDecimalDigits(form.numDependents)),
    // Free strings until a chip is chosen ('' is the unchosen state), narrowed
    // here only for the type: the pipe validates them for real one line down,
    // so an invalid value fails the parse rather than reaching the profile.
    clothingSize: form.clothingSize as z.input<typeof logisticsStepSchema>['clothingSize'],
    shoeSize: form.shoeSize,
    avatarUrl: undefined,
  }))
  .pipe(logisticsStepSchema);

/** Screen-specific schemas reuse the joint stored fields and their validation rules. */
const contactStepSchema = logisticsFields
  .omit({ clothingSize: true, shoeSize: true })
  .superRefine(refineDependents)
  .transform(normalizeDependents);
export const contactFormSchema = logisticsFormFields
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
  .transform((form): z.input<typeof contactStepSchema> => ({
    ...form,
    referenceContactName: form.hasReferenceEntity === false ? '' : form.referenceContactName,
    referenceEntity:
      form.hasReferenceEntity === false ||
      form.referenceEntity === null ||
      form.referenceEntity.trim() === ''
        ? null
        : form.referenceEntity,
    numDependents:
      form.numDependents === undefined || form.numDependents.trim() === ''
        ? 0
        : Number(normalizeDecimalDigits(form.numDependents)),
  }))
  .pipe(contactStepSchema);
export type ContactFormInput = z.input<typeof contactFormSchema>;
export type ContactFormValue = z.output<typeof contactFormSchema>;
export const equipmentFormSchema = logisticsFormFields
  .pick({ clothingSize: true, shoeSize: true })
  .pipe(logisticsFields.pick({ clothingSize: true, shoeSize: true }));
export type EquipmentFormInput = z.input<typeof equipmentFormSchema>;
export type EquipmentFormValue = z.output<typeof equipmentFormSchema>;

export { documentationStepSchema as documentationFormSchema };
