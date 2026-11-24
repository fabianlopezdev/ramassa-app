/**
 * Her answers to the questions staff added to a form she sends when she wants
 * (RAPP-939, RAPP-940), each under its question as she read it. The
 * suggestions inbox and the mentoring queue show them with this one list.
 */

import { useAnswerWords } from '@/components/participants/custom-answer-value';
import { useTranslation } from 'react-i18next';
import { answerText, textIn, type CustomAnswerValue } from '@ramassa/shared/intake-builder';
import { formAnswerQuestion, type FormAnswer } from '@ramassa/shared/on-demand-form';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function FormAnswerList({
  testId,
  answers,
}: {
  readonly testId: string;
  readonly answers: readonly FormAnswer[];
}) {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const words = useAnswerWords();
  if (answers.length === 0) return null;
  return (
    <dl data-testid={testId} className="grid gap-2">
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
