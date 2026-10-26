/**
 * The forms the team creates (RAPP-700), as the catalog sends them.
 *
 * A form has a name in five languages (Catalan required) and three choices:
 * who fills it (`player` on her phone, `team` on her page; `entity` is not
 * available yet), how mandatory it is (`optional`, `required_to_use_app`,
 * `required_from_date` with its deadline) and when it appears (`once`,
 * `every_season`, `sent`). Its screens hold placements of fields, consents and
 * signature blocks, the way Onboarding's screens do; the catalog sends those
 * with the other placements, each naming its form.
 *
 * Docs: https://zod.dev/api
 */
import { z } from 'zod';
import { anyLanguageTextSchema, type BuilderText } from './profile-layout';

export const CUSTOM_FORM_FILLERS = ['player', 'team', 'entity'] as const;
export type CustomFormFiller = (typeof CUSTOM_FORM_FILLERS)[number];

export const CUSTOM_FORM_MANDATORY_LEVELS = [
  'optional',
  'required_to_use_app',
  'required_from_date',
] as const;
export type CustomFormMandatory = (typeof CUSTOM_FORM_MANDATORY_LEVELS)[number];

export const CUSTOM_FORM_APPEARANCES = ['once', 'every_season', 'sent'] as const;
export type CustomFormAppears = (typeof CUSTOM_FORM_APPEARANCES)[number];

/** One screen of a form, in the order she walks them. */
export interface CustomFormScreen {
  readonly id: string;
  readonly title: BuilderText;
  readonly intro: BuilderText | null;
  readonly sortOrder: number;
}

export interface CustomForm {
  readonly id: string;
  readonly name: BuilderText;
  readonly filledBy: CustomFormFiller;
  readonly mandatory: CustomFormMandatory;
  /** The date from which a form required from a date keeps her from the app (YYYY-MM-DD). */
  readonly deadline: string | null;
  readonly appears: CustomFormAppears;
  readonly version: number;
  /** When it started asking; null while staff still build it. */
  readonly publishedAt: string | null;
  readonly isArchived: boolean;
  readonly screens: readonly CustomFormScreen[];
}

const screenSchema = z.object({
  id: z.uuid(),
  title: anyLanguageTextSchema,
  intro: anyLanguageTextSchema.nullable(),
  sort_order: z.number().int(),
});

const formSchema = z.object({
  id: z.uuid(),
  name: anyLanguageTextSchema,
  filled_by: z.enum(CUSTOM_FORM_FILLERS),
  mandatory: z.enum(CUSTOM_FORM_MANDATORY_LEVELS),
  deadline: z.string().nullable(),
  appears: z.enum(CUSTOM_FORM_APPEARANCES),
  version: z.number().int().min(1),
  published_at: z.string().nullable(),
  is_archived: z.boolean(),
  screens: z.array(screenSchema),
});

/** The catalog's forms; a row this build cannot read is left out. */
export function parseCustomForms(raw: unknown): readonly CustomForm[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row): CustomForm[] => {
    const parsed = formSchema.safeParse(row);
    if (!parsed.success) return [];
    const form = parsed.data;
    return [
      {
        id: form.id,
        name: form.name,
        filledBy: form.filled_by,
        mandatory: form.mandatory,
        deadline: form.deadline,
        appears: form.appears,
        version: form.version,
        publishedAt: form.published_at,
        isArchived: form.is_archived,
        screens: [...form.screens]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((screen) => ({
            id: screen.id,
            title: screen.title,
            intro: screen.intro,
            sortOrder: screen.sort_order,
          })),
      },
    ];
  });
}
