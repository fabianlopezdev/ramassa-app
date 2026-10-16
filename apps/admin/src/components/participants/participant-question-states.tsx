/**
 * What her guided registration asks (RAPP-301), for a woman who has not
 * joined yet. One choice per question:
 *   - Auto: asked only if nobody answered it;
 *   - Ask: always asked, opening with the staff answer for her to confirm;
 *   - Don't ask: never asked. Her summary still shows the value.
 * Two presets fill every choice at once; staff then change single questions
 * and save. Don't ask is not offered on a required question nobody answered,
 * and the database refuses it too.
 */

import { Button } from '@/components/ui/button';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  canSkipQuestion,
  INTAKE_STATE_PRESETS,
  questionState,
  WIZARD_QUESTIONS,
  type AnsweredQuestions,
  type IntakeQuestion,
  type IntakeQuestionState,
  type IntakeStatePreset,
  type QuestionStates,
} from '@ramassa/shared/intake';

/** The wizard's own question labels, so staff read what she reads. */
const QUESTION_LABEL_KEYS: Readonly<Partial<Record<IntakeQuestion, string>>> = {
  first_name: 'onboarding:firstNameLabel',
  last_name: 'onboarding:lastNameLabel',
  date_of_birth: 'onboarding:dateOfBirthLabel',
  place_of_birth: 'onboarding:placeOfBirthLabel',
  nationality: 'onboarding:nationalityLabel',
  preferred_language: 'onboarding:preferredLanguageLabel',
  document: 'onboarding:documentTypeLabel',
  phone: 'onboarding:phoneLabel',
  address: 'onboarding:addressLabel',
  city: 'onboarding:cityLabel',
  postal_code: 'onboarding:postalCodeLabel',
  reference_entity: 'onboarding:referenceEntityLabel',
  reference_contact_name: 'onboarding:referenceContactNameLabel',
  dependents: 'onboarding:hasDependentsLabel',
  clothing_size: 'onboarding:clothingSizeLabel',
  shoe_size: 'onboarding:shoeSizeLabel',
};

const STATE_LABEL_KEYS: Readonly<Record<IntakeQuestionState, string>> = {
  auto: 'participants:questionStateAuto',
  ask: 'participants:questionStateAsk',
  skip: 'participants:questionStateSkip',
};

export interface ParticipantQuestionStatesProps {
  readonly states: QuestionStates;
  readonly answered: AnsweredQuestions;
  readonly onSave: (next: QuestionStates) => Promise<void>;
  readonly errorMessage?: string;
}

export function ParticipantQuestionStates({
  states,
  answered,
  onSave,
  errorMessage,
}: ParticipantQuestionStatesProps) {
  const { t } = useTranslation(['participants', 'onboarding']);
  // What the boxes start from: the saved states, or a preset staff just applied.
  const [base, setBase] = useState<QuestionStates>(states);
  const [formKey, setFormKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  function applyPreset(preset: IntakeStatePreset) {
    // A preset never hides anything, so it is always allowed.
    setBase(INTAKE_STATE_PRESETS[preset]);
    setFormKey((key) => key + 1);
    setIsSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const next: Partial<Record<IntakeQuestion, 'ask' | 'skip'>> = {};
    for (const question of WIZARD_QUESTIONS) {
      const value = fields.get(`question-state-${question}`);
      if (value === 'ask' || value === 'skip') next[question] = value;
    }
    setIsSaving(true);
    try {
      await onSave(next);
      setIsSaved(true);
    } catch {
      // The page shows why it failed.
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="question-states-title"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      data-testid="participant-question-states"
    >
      <div className="flex flex-col gap-1">
        <h2 id="question-states-title" className="text-start text-lg font-semibold">
          {t('participants:questionStatesTitle')}
        </h2>
        <p className="text-start text-sm text-muted-foreground">
          {t('participants:questionStatesIntro')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => applyPreset('missing')}>
          {t('participants:questionStatesPresetMissing')}
        </Button>
        <Button type="button" variant="outline" onClick={() => applyPreset('review')}>
          {t('participants:questionStatesPresetReview')}
        </Button>
      </div>
      <form
        key={formKey}
        className="flex flex-col gap-4"
        onSubmit={(event) => void submit(event)}
        onChange={() => setIsSaved(false)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {WIZARD_QUESTIONS.map((question) => {
            const id = `question-state-${question}`;
            const skippable = canSkipQuestion(question, answered);
            const current = questionState(base, question);
            return (
              <div key={question} className="flex flex-col gap-1.5">
                <label htmlFor={id} className="text-start text-sm font-medium">
                  {t(QUESTION_LABEL_KEYS[question] ?? question)}
                </label>
                <select
                  id={id}
                  name={id}
                  defaultValue={current === 'skip' && !skippable ? 'auto' : current}
                  aria-describedby={skippable ? undefined : `${id}-hint`}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {(['auto', 'ask', 'skip'] as const).map((state) => (
                    <option key={state} value={state} disabled={state === 'skip' && !skippable}>
                      {t(STATE_LABEL_KEYS[state])}
                    </option>
                  ))}
                </select>
                <p className="text-start text-xs text-muted-foreground">
                  {answered.has(question)
                    ? t('participants:questionStatesAnswered')
                    : t('participants:questionStatesUnanswered')}
                </p>
                {skippable ? null : (
                  <p id={`${id}-hint`} className="text-start text-xs text-muted-foreground">
                    {t('participants:questionStatesRequiredHint')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={isSaving}>
            {t('participants:questionStatesSave')}
          </Button>
          {isSaved ? (
            <p aria-live="polite" className="text-start text-sm text-muted-foreground">
              {t('participants:questionStatesSaved')}
            </p>
          ) : null}
          {errorMessage === undefined ? null : (
            <p aria-live="polite" className="text-start text-sm text-destructive">
              {errorMessage}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
