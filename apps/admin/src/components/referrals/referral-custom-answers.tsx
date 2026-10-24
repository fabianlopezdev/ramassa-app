/**
 * What the entity answered to Ramassà's own fields on the referral form
 * (RAPP-307, RAPP-652), in the form's order. Staff see each answer as its
 * privacy level allows; the entity that sent the referral sees all of them.
 */

import { useTranslation } from 'react-i18next';
import {
  answerText,
  entityFormItemsOf,
  entityFormQuestions,
  textIn,
  type CustomAnswers,
  type CustomQuestion,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface ReferralCustomAnswersProps {
  readonly catalog: IntakeCatalog;
  readonly answers: CustomAnswers;
}

/** The answered fields: the form's in its order, then any taken off the form since. */
function answeredQuestions(
  catalog: IntakeCatalog,
  answers: CustomAnswers,
): readonly CustomQuestion[] {
  const onForm = entityFormQuestions(entityFormItemsOf(catalog));
  const listed = new Set(onForm.map((question) => question.id));
  const others = catalog.screens
    .flatMap((screen) => screen.questions)
    .filter((question) => !listed.has(question.id));
  return [...onForm, ...others].filter((question) => answers[question.id] !== undefined);
}

export function ReferralCustomAnswers({ catalog, answers }: ReferralCustomAnswersProps) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const words = {
    yes: t('questions.answers.yes'),
    no: t('questions.answers.no'),
    maybe: t('questions.answers.maybe'),
    archived: t('questions.archivedOption'),
  };
  const questions = answeredQuestions(catalog, answers);
  if (questions.length === 0) return null;
  return (
    <dl className="grid gap-2 sm:grid-cols-2" data-testid="referral-custom-answers">
      {questions.map((question) => (
        <div key={question.id} className="flex flex-col gap-0.5">
          <dt className="text-start text-xs text-muted-foreground">
            {textIn(question.label, language)}
          </dt>
          <dd className="text-start text-sm" dir="auto">
            {answerText(question, answers[question.id]!, language, words)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
