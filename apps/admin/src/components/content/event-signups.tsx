/**
 * Who signed up for an activity, with her answers to its sign-up questions
 * (RAPP-941), on the activity's page. The database sends the sign-ups whoever
 * reads them may read, each with her name at the level the reader may read it;
 * each answer shows under its question as she read it. A sign-up from an
 * installed build has no answers.
 */

import { FormAnswerList } from '@/components/custom-forms/form-answer-list';
import { EditorSection } from '@/components/layout/editor-section';
import { pageClassName } from '@/components/layout/page';
import { useTranslation } from 'react-i18next';
import type { EventSignupWithAnswers } from '@ramassa/shared/event-signup-form';

export function EventSignups({ signups }: { readonly signups: readonly EventSignupWithAnswers[] }) {
  const { t } = useTranslation('events');
  const active = signups.filter((signup) => signup.state !== 'cancelled');
  if (active.length === 0) return null;
  return (
    // Right below the activity's editor, in the same frame.
    <div className={pageClassName('pt-0 sm:pt-0')}>
      <EditorSection
        title={t('signupsTitle', { count: active.length })}
        isFlush
        testId="event-signups"
      >
        <ol
          className="flex flex-col divide-y"
          aria-label={t('signupsTitle', { count: active.length })}
        >
          {active.map((signup) => (
            <li
              key={signup.signupId}
              className="flex flex-col gap-2 px-5 py-3"
              data-testid={`event-signup-${signup.playerId}`}
            >
              <span className="text-start text-sm font-medium">
                {[signup.firstName, signup.lastName].filter((part) => part.length > 0).join(' ')}
              </span>
              <FormAnswerList
                testId={`event-signup-answers-${signup.playerId}`}
                answers={signup.answers}
              />
            </li>
          ))}
        </ol>
      </EditorSection>
    </div>
  );
}
