import { z } from 'zod';

export const SUPPORT_NEED_CATEGORIES = [
  'accessibility',
  'health',
  'communication',
  'wellbeing',
  'other',
] as const;
export type SupportNeedCategory = (typeof SUPPORT_NEED_CATEGORIES)[number];
export type SupportNeedChoice = SupportNeedCategory | 'none';
export const SUPPORT_NEED_DETAIL_MAX_LENGTH = 2000;
export const SUPPORT_NEEDS_MAX_LENGTH = 32000;
export const SUPPORT_NEED_LABEL_KEYS = {
  accessibility: 'onboarding:supportNeedAccessibility',
  health: 'onboarding:supportNeedHealth',
  communication: 'onboarding:supportNeedCommunication',
  wellbeing: 'onboarding:supportNeedWellbeing',
  other: 'onboarding:supportNeedOther',
  none: 'onboarding:supportNeedNone',
} as const;
export interface SupportNeedsAnswer {
  readonly categories: readonly SupportNeedChoice[];
  readonly explanation?: string;
  readonly details: Readonly<Partial<Record<SupportNeedCategory, string>>>;
}
const envelopeSchema = z
  .object({
    kind: z.literal('support-needs'),
    version: z.literal(1),
    explanation: z.string().max(SUPPORT_NEED_DETAIL_MAX_LENGTH).optional(),
    categories: z
      .array(z.enum([...SUPPORT_NEED_CATEGORIES, 'none']))
      .min(1)
      .max(SUPPORT_NEED_CATEGORIES.length),
    details: z.partialRecord(
      z.enum(SUPPORT_NEED_CATEGORIES),
      z.string().max(SUPPORT_NEED_DETAIL_MAX_LENGTH),
    ),
  })
  .strict()
  .refine(
    (answer) =>
      new Set(answer.categories).size === answer.categories.length &&
      (!answer.categories.includes('none') ||
        (answer.categories.length === 1 && !answer.explanation)) &&
      Object.keys(answer.details).every((category) =>
        answer.categories.includes(category as SupportNeedCategory),
      ),
  );

export function decodeSupportNeeds(value: string | null | undefined): SupportNeedsAnswer | null {
  if (!value) return null;
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(value));
    return parsed.success
      ? {
          categories: parsed.data.categories,
          details: parsed.data.details,
          ...(parsed.data.explanation === undefined
            ? {}
            : { explanation: parsed.data.explanation }),
        }
      : null;
  } catch {
    return null;
  }
}
export function encodeSupportNeeds(answer: SupportNeedsAnswer): string {
  if (answer.categories.length === 0) return '';
  return JSON.stringify(envelopeSchema.parse({ kind: 'support-needs', version: 1, ...answer }));
}
export function supportNeedsForEditing(value: unknown): SupportNeedsAnswer {
  const raw = typeof value === 'string' ? value : '';
  return (
    decodeSupportNeeds(raw) ??
    (raw.trim()
      ? { categories: ['other'], details: { other: raw } }
      : { categories: [], details: {} })
  );
}
export function toggleSupportNeed(
  answer: SupportNeedsAnswer,
  choice: SupportNeedChoice,
): SupportNeedsAnswer {
  const selected = answer.categories.includes(choice);
  const categories: SupportNeedChoice[] =
    choice === 'none'
      ? selected
        ? []
        : ['none']
      : SUPPORT_NEED_CATEGORIES.filter((category) =>
          category === choice ? !selected : answer.categories.includes(category),
        );
  const details = Object.fromEntries(
    Object.entries(answer.details).filter(([category]) =>
      categories.includes(category as SupportNeedCategory),
    ),
  );
  return {
    categories,
    details,
    ...(answer.explanation !== undefined && categories.length > 0 && !categories.includes('none')
      ? { explanation: answer.explanation }
      : {}),
  };
}
export function selectedSupportNeeds(answer: SupportNeedsAnswer): SupportNeedCategory[] {
  return SUPPORT_NEED_CATEGORIES.filter((category) => answer.categories.includes(category));
}
export function formatSupportNeeds(
  value: string | null | undefined,
  translate: (key: string) => string,
): string {
  const answer = decodeSupportNeeds(value);
  if (!answer) return value ?? '';
  if (answer.explanation !== undefined)
    return `${answer.categories.map((category) => translate(SUPPORT_NEED_LABEL_KEYS[category])).join(', ')}\n\n${answer.explanation}`.trim();
  return answer.categories
    .map((category) => {
      const label = translate(SUPPORT_NEED_LABEL_KEYS[category]);
      const detail = category === 'none' ? '' : answer.details[category]?.trim();
      return detail ? `${label}: ${detail}` : label;
    })
    .join('\n\n');
}
export function isValidSupportNeedsText(value: string): boolean {
  if (value.length > SUPPORT_NEEDS_MAX_LENGTH) return false;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && 'kind' in parsed && parsed.kind === 'support-needs')
      return envelopeSchema.safeParse(parsed).success;
  } catch {
    /* Legacy free text. */
  }
  return true;
}
