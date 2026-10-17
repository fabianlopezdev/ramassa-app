/**
 * What the entity answered to the questions staff added to the referral form
 * (RAPP-307), grouped by screen. Staff see each answer as its privacy level
 * allows; the entity that sent the referral sees all of them.
 */

import { useTranslation } from 'react-i18next';
import {
  answerText,
  textIn,
  type CustomAnswers,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface ReferralCustomAnswersProps {
  readonly catalog: IntakeCatalog;
  readonly answers: CustomAnswers;
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
  const screens = catalog.screens
    .map((screen) => ({
      screen,
      questions: screen.questions.filter((question) => answers[question.id] !== undefined),
    }))
    .filter(({ questions }) => questions.length > 0);
  if (screens.length === 0) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="referral-custom-answers">
      {screens.map(({ screen, questions }) => (
        <div key={screen.id} className="flex flex-col gap-1">
          <p className="text-start text-sm font-semibold">{textIn(screen.title, language)}</p>
          <dl className="grid gap-2 sm:grid-cols-2">
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
        </div>
      ))}
    </div>
  );
}
