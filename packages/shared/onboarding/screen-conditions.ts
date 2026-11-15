/**
 * Screens that depend on an answer of another screen (RAPP-715): one rule for
 * every screen, the app's and the team's.
 *
 * A screen can carry a condition: a choice field and the answers that open
 * it. It shows only when her answer to that field is one of them; for a
 * multiple choice, when one of them is ticked. The question is asked on an
 * earlier screen of the same form, its parent, and the screen sits right after
 * it (the ordering rule below). A follow-up can have its own follow-ups, at
 * any depth; the database refuses a loop.
 *
 * The database keeps the same rules (`private.answer_matches`,
 * `private.with_branches_after_parents`, migration
 * `20261027060000_screens_that_depend_on_an_answer.sql`).
 */

/**
 * The answer that opens a screen: a choice field by id and the answers, as
 * her answers store them (option ids, or `yes` / `no` / `maybe`).
 */
export interface ScreenCondition {
  readonly fieldId: string;
  readonly values: readonly string[];
}

/** The field types a screen can depend on: every choice. */
export const CONDITION_FIELD_TYPES = [
  'single_choice',
  'multiple_choice',
  'search_choice',
  'yes_no',
  'yes_no_maybe',
] as const;

export function isConditionFieldType(type: string): boolean {
  return (CONDITION_FIELD_TYPES as readonly string[]).includes(type);
}

/** Whether her answer is one of the answers: one of them, or one of them ticked. */
export function conditionHolds(values: readonly string[], answer: unknown): boolean {
  if (typeof answer === 'string') return values.includes(answer);
  if (typeof answer === 'boolean') return values.includes(answer ? 'yes' : 'no');
  if (Array.isArray(answer)) return answer.some((each) => values.includes(String(each)));
  return false;
}

/** Whether every condition holds for her answers by field id (a screen and the ones above it). */
export function conditionsHold(
  conditions: readonly ScreenCondition[],
  answers: Readonly<Record<string, unknown>>,
): boolean {
  return conditions.every((condition) =>
    conditionHolds(condition.values, answers[condition.fieldId]),
  );
}

/**
 * The ordering rule: each follow-up right after its parent and the parent's
 * earlier follow-ups, depth first (3, 3a, 3a.1, 3b). Follow-ups of one parent
 * keep their order in `order`. A step whose parent is not in the list stays
 * where it is. A step caught in a loop the rules refuse stays, at the end.
 */
export function branchesAfterParents<Key extends string>(
  order: readonly Key[],
  parentOf: (key: Key) => string | null | undefined,
): Key[] {
  const present = new Set<string>(order);
  const result: Key[] = [];
  const emit = (key: Key, depth: number) => {
    if (result.includes(key)) return;
    result.push(key);
    if (depth > 64) return;
    for (const child of order) {
      if (child !== key && parentOf(child) === key) emit(child, depth + 1);
    }
  };
  for (const key of order) {
    const parent = parentOf(key);
    if (parent == null || !present.has(parent)) emit(key, 0);
  }
  return [...result, ...order.filter((key) => !result.includes(key))];
}

/**
 * The family of a screen as one flat list, depth first, each with its number
 * on the board: the screen ("3"), its follow-ups with a letter ("3a", "3b"),
 * theirs with a number after a dot ("3a.1", "3a.1.2").
 */
export function familyNumbers<Key extends string>(
  root: Key,
  rootNumber: string,
  childrenOf: (key: Key) => readonly Key[],
): readonly { readonly key: Key; readonly number: string; readonly depth: number }[] {
  const family: { key: Key; number: string; depth: number }[] = [];
  const walk = (key: Key, number: string, depth: number) => {
    family.push({ key, number, depth });
    if (depth > 64) return;
    childrenOf(key).forEach((child, index) => {
      const own = depth === 0 ? String.fromCharCode(97 + index) : `.${index + 1}`;
      walk(child, `${number}${own}`, depth + 1);
    });
  };
  walk(root, rootNumber, 0);
  return family;
}
