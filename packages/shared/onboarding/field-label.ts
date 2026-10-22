/**
 * The label of a built-in wizard field, with "(optional)" when the
 * organization's required list says so (pending fix 21, RAPP-611). The
 * bundled labels carry no fixed "(optional)" any more, so a question staff
 * make required stops saying it, and one they make optional starts.
 *
 * The documentation step and the season questions keep their labels plain:
 * the screen's own introduction already says the step is optional, and a
 * suffix on every one of their labels would repeat it.
 */
import type { IntakeQuestion } from './intake';
import { isRequiredQuestion, type RequiredQuestions } from './question-states';

const SAID_OPTIONAL_BY_SCREEN: ReadonlySet<IntakeQuestion> = new Set<IntakeQuestion>([
  'document',
  'applicant_status',
  'supporting_entities',
  'childcare_need',
  'specific_needs',
]);

export function questionFieldLabel(
  question: IntakeQuestion,
  label: string,
  required: RequiredQuestions,
  optionalLabel: (label: string) => string,
): string {
  if (isRequiredQuestion(question, required) || SAID_OPTIONAL_BY_SCREEN.has(question)) return label;
  return optionalLabel(label);
}
