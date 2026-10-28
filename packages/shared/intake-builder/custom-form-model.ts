/**
 * The forms the team creates (RAPP-700, RAPP-701), as the catalog sends them.
 *
 * A form has a name in five languages (Catalan required) and its choices:
 * who fills it (`player` on her phone; `entity` is not available yet), when
 * it must be answered (`optional`, `required_to_use_app`, `required_from_date`
 * with its deadline), who it is for (`all` players, including those who join
 * later, or the players `chosen`) and whether it repeats every season. Its screens hold placements of fields, consents and
 * signature blocks, the way Onboarding's screens do; the catalog sends those
 * with the other placements, each naming its form.
 *
 * Docs: https://zod.dev/api
 */
import { z } from 'zod';
import type { ScreenCondition } from '../onboarding/screen-conditions';
import { anyLanguageTextSchema, type BuilderText } from './profile-layout';

/** Who fills a form in (RAPP-701): her on the app; an entity form is not available yet. */
export const CUSTOM_FORM_FILLERS = ['player', 'entity'] as const;
export type CustomFormFiller = (typeof CUSTOM_FORM_FILLERS)[number];

export const CUSTOM_FORM_MANDATORY_LEVELS = [
  'optional',
  'required_to_use_app',
  'required_from_date',
] as const;
export type CustomFormMandatory = (typeof CUSTOM_FORM_MANDATORY_LEVELS)[number];

/** Who a form is for (RAPP-701): every player, including those who join later, or the players picked. */
export const CUSTOM_FORM_AUDIENCES = ['all', 'chosen'] as const;
export type CustomFormAudience = (typeof CUSTOM_FORM_AUDIENCES)[number];

/** One screen of a form, in the order she walks them. */
export interface CustomFormScreen {
  readonly id: string;
  readonly title: BuilderText;
  readonly intro: BuilderText | null;
  readonly sortOrder: number;
  /** Staff hid it (RAPP-711): the next published version leaves it out. Absent means shown. */
  readonly isHidden?: boolean;
  /** The answer that opens it (RAPP-715); absent, it always shows. */
  readonly showWhen?: ScreenCondition;
}

/** A Publica of a form (RAPP-701): its number, its season when it repeats, and whether it corrected. */
export interface CustomFormVersion {
  readonly version: number;
  readonly seasonId: string | null;
  readonly isCorrection: boolean;
  readonly publishedAt: string;
}

/**
 * A form. The team reads its draft; her phone reads the version published
 * for now (name, when to answer, screens), so a draft never reaches her.
 */
export interface CustomForm {
  readonly id: string;
  readonly name: BuilderText;
  readonly filledBy: CustomFormFiller;
  readonly mandatory: CustomFormMandatory;
  /** The date from which a form required from a date keeps her from the app (YYYY-MM-DD). */
  readonly deadline: string | null;
  readonly audience: CustomFormAudience;
  readonly repeatsEachSeason: boolean;
  /** How many players were picked, for the team; null on her phone. */
  readonly recipientCount: number | null;
  /** The latest published version's number. */
  readonly version: number;
  /** When it was first published; null while it is a draft only. */
  readonly publishedAt: string | null;
  readonly isArchived: boolean;
  /** Its published versions, newest first, for the people who design it. */
  readonly versions: readonly CustomFormVersion[];
  readonly screens: readonly CustomFormScreen[];
}

const screenSchema = z.object({
  id: z.uuid(),
  title: anyLanguageTextSchema,
  intro: anyLanguageTextSchema.nullable(),
  sort_order: z.number().int(),
  // The team's draft only (RAPP-711); a published version leaves a hidden screen out.
  is_hidden: z.boolean().optional(),
  // The answer that opens it (RAPP-715); an older version has none.
  show_when_field_id: z.uuid().nullable().optional(),
  show_when_values: z.array(z.string()).nullable().optional(),
});

const formSchema = z.object({
  id: z.uuid(),
  name: anyLanguageTextSchema,
  // A form the team filled in (RAPP-700) is hers to fill in since RAPP-701.
  filled_by: z
    .enum(['player', 'team', 'entity'])
    .transform((value) => (value === 'team' ? 'player' : value)),
  mandatory: z.enum(CUSTOM_FORM_MANDATORY_LEVELS),
  deadline: z.string().nullable(),
  // An older server sends `appears` only (RAPP-700).
  appears: z.enum(['once', 'every_season', 'sent']).optional(),
  audience: z.enum(CUSTOM_FORM_AUDIENCES).optional(),
  repeats_each_season: z.boolean().optional(),
  recipient_count: z.number().int().optional(),
  version: z.number().int().min(1),
  published_at: z.string().nullable(),
  is_archived: z.boolean(),
  versions: z
    .array(
      z.object({
        version: z.number().int(),
        season_id: z.uuid().nullable(),
        is_correction: z.boolean(),
        published_at: z.string(),
      }),
    )
    .optional(),
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
        audience: form.audience ?? (form.appears === 'sent' ? 'chosen' : 'all'),
        repeatsEachSeason: form.repeats_each_season ?? form.appears === 'every_season',
        recipientCount: form.recipient_count ?? null,
        version: form.version,
        publishedAt: form.published_at,
        isArchived: form.is_archived,
        versions: (form.versions ?? []).map((version) => ({
          version: version.version,
          seasonId: version.season_id,
          isCorrection: version.is_correction,
          publishedAt: version.published_at,
        })),
        screens: [...form.screens]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((screen) => ({
            id: screen.id,
            title: screen.title,
            intro: screen.intro,
            sortOrder: screen.sort_order,
            isHidden: screen.is_hidden ?? false,
            ...(screen.show_when_field_id == null || (screen.show_when_values ?? []).length === 0
              ? {}
              : {
                  showWhen: {
                    fieldId: screen.show_when_field_id,
                    values: screen.show_when_values ?? [],
                  },
                }),
          })),
      },
    ];
  });
}
