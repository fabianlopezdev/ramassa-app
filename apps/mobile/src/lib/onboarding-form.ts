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
  logisticsStepSchema,
} from '@ramassa/shared/schemas';

/** '7' -> '07'; anything non-numeric survives to fail the shared schema. */
export function composeIsoBirthDate(day: string, month: string, year: string): string {
  return `${year.trim()}-${month.trim().padStart(2, '0')}-${day.trim().padStart(2, '0')}`;
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

/**
 * The identity screen's form: shared fields plus the three date parts. The
 * composed date is validated by the SHARED schema via pipe, so "too young" and
 * "invalid date" are never re-implemented here; the refine only reports them
 * onto the `year` field, which is where the eye lands on a three-part row.
 */
export const identityFormSchema = identityStepSchema
  .omit({ dateOfBirth: true })
  .extend({
    day: z.string().trim().min(1).max(2),
    month: z.string().trim().min(1).max(2),
    year: z.string().trim().length(4),
  })
  .superRefine((form, context) => {
    const iso = composeIsoBirthDate(form.day, form.month, form.year);
    const result = identityStepSchema.shape.dateOfBirth.safeParse(iso);
    if (!result.success) {
      const isTooYoung = result.error.issues.some((issue) => issue.message === 'too young');
      context.addIssue({
        code: 'custom',
        path: ['year'],
        message: isTooYoung ? 'too young' : 'invalid date',
      });
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
export const logisticsFormSchema = z
  .object({
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
  })
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
        : Number(form.numDependents),
    // Free strings until a chip is chosen ('' is the unchosen state), narrowed
    // here only for the type: the pipe validates them for real one line down,
    // so an invalid value fails the parse rather than reaching the profile.
    clothingSize: form.clothingSize as z.input<typeof logisticsStepSchema>['clothingSize'],
    shoeSize: form.shoeSize,
    avatarUrl: undefined,
  }))
  .pipe(logisticsStepSchema);
export type LogisticsFormInput = z.input<typeof logisticsFormSchema>;

export { documentationStepSchema as documentationFormSchema };
