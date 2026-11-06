/**
 * The title of her needs details screen: the question for the one need she
 * ticked, or one question naming every need she ticked. Her needs screen's
 * own follow-up and the one that follows Necessitats específiques wherever
 * staff moved it (RAPP-782) read the same words. Pure, so bun tests run it.
 */
import {
  systemFieldsOf,
  type CustomAnswers,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import {
  SUPPORT_NEED_CATEGORIES,
  SUPPORT_NEED_LABEL_KEYS,
  type SupportNeedCategory,
} from '@ramassa/shared/schemas';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const QUESTION_KEYS: Readonly<Record<SupportNeedCategory, string>> = {
  accessibility: 'supportNeedAccessibilityQuestion',
  health: 'supportNeedHealthQuestion',
  communication: 'supportNeedCommunicationQuestion',
  wellbeing: 'supportNeedWellbeingQuestion',
  other: 'supportNeedOtherQuestion',
};

/** The details screen's title for the needs she ticked, in the app's order; null for none. */
export function supportNeedsTitle(
  selected: readonly SupportNeedCategory[],
  t: Translate,
): string | null {
  const [first] = selected;
  if (first === undefined) return null;
  if (selected.length === 1) return t(QUESTION_KEYS[first]);
  const labels = selected.map((item) => t(SUPPORT_NEED_LABEL_KEYS[item]));
  const needs = t('supportNeedsListAnd', {
    first: labels.slice(0, -1).join(', '),
    last: labels.at(-1),
  });
  return t('supportNeedsCombinedQuestion', { needs });
}

/**
 * The needs she ticked on Necessitats específiques asked by field (an option
 * id each), as the app's categories in their order.
 */
export function tickedSupportNeeds(
  catalog: IntakeCatalog,
  answers: CustomAnswers,
): readonly SupportNeedCategory[] {
  const field = systemFieldsOf(catalog).get('specific_needs');
  const value = field === undefined ? undefined : answers[field.id];
  const ticked = new Set(
    (Array.isArray(value) ? value : [value]).flatMap((id) => {
      const key = field?.options.find((option) => option.id === id)?.key;
      return key == null ? [] : [key];
    }),
  );
  return SUPPORT_NEED_CATEGORIES.filter((category) => ticked.has(category));
}
