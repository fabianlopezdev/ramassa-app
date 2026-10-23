/**
 * What her guided registration asks (RAPP-301, RAPP-645), for a woman who has
 * not joined yet: her copy of the Onboarding board, as on the last step of
 * creating her. Every question, the app's own and Ramassà's, grouped by her
 * screens, each with Auto, Ask or Don't ask and whether it is answered; a
 * switch per screen asks or skips it whole. The presets fill every choice,
 * and staff save the current choices as a preset of their own (RAPP-307).
 *
 * Saving sends only what changed (`set_intake_question_states`), a Ramassà
 * question as `custom:<id>`. Don't ask is not offered on a required question
 * nobody answered, and the database refuses it too.
 */

import { PlayerQuestionsBoard } from '@/components/participants/invite-questions-review';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnsweredQuestions, QuestionStates } from '@ramassa/shared/intake';
import {
  EMPTY_INTAKE_CATALOG,
  type CustomAnswers,
  type CustomQuestionStates,
  type IntakeCatalog,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';

export interface ParticipantQuestionStatesProps {
  readonly states: QuestionStates;
  /** Her saved choices on Ramassà's questions (RAPP-645). */
  readonly customStates?: CustomQuestionStates;
  readonly answered: AnsweredQuestions;
  /** Her answers to Ramassà's questions, which decide what Auto asks. */
  readonly customAnswers?: CustomAnswers;
  /** The organization's screens, questions, required list and presets. */
  readonly catalog?: IntakeCatalog;
  readonly onSave: (next: PlayerChoices) => Promise<void>;
  readonly errorMessage?: string;
  readonly onSavePreset?: (name: string, states: QuestionStates) => Promise<void>;
  readonly onDeletePreset?: (id: string) => Promise<void>;
}

export function ParticipantQuestionStates({
  states,
  customStates = {},
  answered,
  customAnswers = {},
  catalog = EMPTY_INTAKE_CATALOG,
  onSave,
  errorMessage,
  onSavePreset,
  onDeletePreset,
}: ParticipantQuestionStatesProps) {
  const { t } = useTranslation('participants');
  const [choices, setChoices] = useState<PlayerChoices>({ states, customStates });
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetStatus, setPresetStatus] = useState<'idle' | 'saved' | 'failed'>('idle');

  async function save() {
    setIsSaving(true);
    try {
      await onSave(choices);
      setIsSaved(true);
    } catch {
      // The page shows why it failed.
    } finally {
      setIsSaving(false);
    }
  }

  async function savePreset() {
    const name = presetName.trim();
    if (name === '' || onSavePreset === undefined) return;
    try {
      // A preset holds the app's questions only, as the organization's presets do.
      await onSavePreset(name, choices.states);
      setPresetStatus('saved');
      setPresetName('');
    } catch {
      setPresetStatus('failed');
    }
  }

  return (
    <section
      className="flex flex-col gap-6 rounded-xl border bg-card p-5"
      data-testid="participant-question-states"
    >
      <PlayerQuestionsBoard
        catalog={catalog}
        answered={answered}
        customAnswers={customAnswers}
        choices={choices}
        onChange={(next) => {
          setChoices(next);
          setIsSaved(false);
        }}
        onDeletePreset={
          onDeletePreset === undefined
            ? undefined
            : (preset) => {
                if (window.confirm(t('questionStatesDeletePreset', { name: preset.name }))) {
                  void onDeletePreset(preset.id);
                }
              }
        }
        testId="participant-questions"
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={isSaving} onClick={() => void save()}>
              {t('questionStatesSave')}
            </Button>
            {isSaved ? (
              <p aria-live="polite" className="text-start text-sm text-muted-foreground">
                {t('questionStatesSaved')}
              </p>
            ) : null}
            {errorMessage === undefined ? null : (
              <p aria-live="polite" className="text-start text-sm text-destructive">
                {errorMessage}
              </p>
            )}
          </div>
        }
      />
      {onSavePreset === undefined ? null : (
        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="flex w-full max-w-xs flex-col gap-1.5 text-sm font-medium">
            <span className="text-start">{t('questionStatesPresetName')}</span>
            <Input
              id="question-states-preset-name"
              maxLength={80}
              value={presetName}
              onChange={(event) => {
                setPresetName(event.target.value);
                setPresetStatus('idle');
              }}
            />
          </label>
          <Button type="button" variant="outline" onClick={() => void savePreset()}>
            {t('questionStatesSavePreset')}
          </Button>
          {presetStatus === 'idle' ? null : (
            <p
              aria-live="polite"
              className={
                presetStatus === 'saved'
                  ? 'text-start text-sm text-muted-foreground'
                  : 'text-start text-sm text-destructive'
              }
            >
              {presetStatus === 'saved'
                ? t('questionStatesPresetSaved')
                : t('questionStatesPresetFailed')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
