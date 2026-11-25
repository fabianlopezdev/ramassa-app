/**
 * Her answers to the questions staff added to a form she sends when she wants
 * (RAPP-939, RAPP-940, RAPP-973), each under its question as she read it. The
 * suggestions inbox, the mentoring queue and the incidents show them with this
 * one list. A form whose own parts read as questions (the incident's what,
 * when and where) lists them first, in the same rows (`leading`).
 */

import { useAnswerWords } from '@/components/participants/custom-answer-value';
import { useTranslation } from 'react-i18next';
import { answerText, textIn, type CustomAnswerValue } from '@ramassa/shared/intake-builder';
import { formAnswerQuestion, type FormAnswer } from '@ramassa/shared/on-demand-form';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function FormAnswerList({
  testId,
  answers,
  leading = [],
}: {
  readonly testId: string;
  readonly answers: readonly FormAnswer[];
  /** The form's own parts, already worded: a label and its value, before her answers. */
  readonly leading?: readonly { readonly label: string; readonly value: string }[];
}) {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const words = useAnswerWords();
  if (answers.length === 0 && leading.length === 0) return null;
  return (
    <dl data-testid={testId} className="grid gap-2">
      {leading.map((part) => (
        <div key={part.label} className="flex flex-col">
          <dt className="text-start text-sm text-neutral-500">{part.label}</dt>
          <dd className="whitespace-pre-wrap text-start text-neutral-800" dir="auto">
            {part.value}
          </dd>
        </div>
      ))}
      {answers.map((answer) => (
        <div key={answer.fieldId} className="flex flex-col">
          <dt className="text-start text-sm text-neutral-500">{textIn(answer.label, language)}</dt>
          <dd className="whitespace-pre-wrap text-start text-neutral-800" dir="auto">
            {answerText(
              formAnswerQuestion(answer),
              answer.value as CustomAnswerValue,
              language,
              words,
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
