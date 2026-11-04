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
 * A form is Legal or Altre (RAPP-771); a screen has a help line and its own
 * button labels.
 *
 * Docs: https://zod.dev/api
 */
import { z } from 'zod';
import { staffTextIn, teamTextIn } from '../i18n/localized-content';
import type { ScreenCondition } from '../onboarding/screen-conditions';
import type { LanguageCode } from '../schemas/language';
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

/**
 * Legal (listed under Condicions legals, published by an admin, never put off)
 * or other (under Altres formularis), RAPP-771.
 */
export const CUSTOM_FORM_KINDS = ['legal', 'other'] as const;
export type CustomFormKind = (typeof CUSTOM_FORM_KINDS)[number];

/** The app's own legal forms as forms of their own (RAPP-771): one each, never archived. */
export const CUSTOM_FORM_SYSTEM_KEYS = ['app_terms', 'season_authorization'] as const;
export type CustomFormSystemKey = (typeof CUSTOM_FORM_SYSTEM_KEYS)[number];

/** A screen's locked part of a legal form (RAPP-771): never deleted, never moved. */
export const FORM_SYSTEM_SCREENS = [
  'terms_sign',
  'authorization_sign',
  'reregistration',
  'reregistration_season',
] as const;
export type FormSystemScreen = (typeof FORM_SYSTEM_SCREENS)[number];

/** A screen's help line and button labels (RAPP-771), as an app screen's. */
export const FORM_SCREEN_TEXT_FIELDS = ['help', 'continue_label', 'decline_label'] as const;
export type FormScreenTextField = (typeof FORM_SCREEN_TEXT_FIELDS)[number];
export type FormScreenTexts = Readonly<Partial<Record<FormScreenTextField, BuilderText>>>;

const formScreenTextsSchema = z
  .object({
    help: anyLanguageTextSchema.optional(),
    continue_label: anyLanguageTextSchema.optional(),
    decline_label: anyLanguageTextSchema.optional(),
  })
  .catch({});

/** A screen's texts as the database sends them; anything this build cannot read is left out. */
export function parseFormScreenTexts(raw: unknown): FormScreenTexts {
  return formScreenTextsSchema.parse(raw ?? {});
}

/**
 * A screen's own texts in one language, by the rule her phone and the Control
 * Center preview share (RAPP-710): a help never written follows the Catalan
 * ('' shows none); a button never written is null, so the app's own label
 * shows.
 */
export function formScreenTextsIn(
  texts: FormScreenTexts | undefined,
  language: LanguageCode,
): {
  readonly help: string;
  readonly continueLabel: string | null;
  /** The decline button of a screen that has one (the terms she signs, RAPP-772). */
  readonly declineLabel: string | null;
} {
  return {
    help: teamTextIn(texts?.help, language, true),
    continueLabel: staffTextIn(texts?.continue_label, language, false),
    declineLabel: staffTextIn(texts?.decline_label, language, false),
  };
}

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
  /** Its help line and button labels (RAPP-771); empty shows the app's own. */
  readonly texts?: FormScreenTexts;
  /** Its locked part of a legal form (RAPP-771); absent on every other screen. */
  readonly systemScreen?: FormSystemScreen;
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
  /** Legal or other (RAPP-771); a server before it sends none: other. */
  readonly kind: CustomFormKind;
  /** One of the app's own legal forms (RAPP-771); null for every form the team created. */
  readonly systemKey: CustomFormSystemKey | null;
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
  // Its help line and buttons, and its locked part (RAPP-771); an older server sends none.
  texts: z.unknown().optional(),
  system_screen: z.enum(FORM_SYSTEM_SCREENS).nullable().optional().catch(null),
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
  kind: z.enum(CUSTOM_FORM_KINDS).optional().catch('other'),
  system_key: z.enum(CUSTOM_FORM_SYSTEM_KEYS).nullable().optional().catch(null),
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
        kind: form.kind ?? 'other',
        systemKey: form.system_key ?? null,
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
            texts: parseFormScreenTexts(screen.texts),
            ...(screen.system_screen == null ? {} : { systemScreen: screen.system_screen }),
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
