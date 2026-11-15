/**
 * What her onboarding will ask, above the Fitxa on her page while she has not
 * joined (RAPP-653): how many of her questions she will be asked, the presets
 * that fill every choice at once, and saving her current choices as a preset
 * of the organization (RAPP-307). The choice of each field sits on its row.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { PlayerChoicePresets } from '@/components/participants/player-choice-presets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuestionStates } from '@ramassa/shared/intake';
import type {
  IntakeCatalog,
  IntakePreset,
  PlayerChoices,
  PlayerPlan,
} from '@ramassa/shared/intake-builder';

export function PlayerChoicesBar({
  plan,
  catalog,
  choices,
  isBusy,
  errorMessage,
  onChange,
  onSavePreset,
  onDeletePreset,
}: {
  readonly plan: PlayerPlan;
  readonly catalog: IntakeCatalog;
  readonly choices: PlayerChoices;
  readonly isBusy: boolean;
  readonly errorMessage?: string;
  readonly onChange: (next: PlayerChoices) => void;
  readonly onSavePreset: (name: string, states: QuestionStates) => Promise<void>;
  readonly onDeletePreset: (preset: IntakePreset) => void;
}) {
  const { t } = useTranslation('participants');
  const [presetName, setPresetName] = useState('');
  const [presetStatus, setPresetStatus] = useState<'idle' | 'saved' | 'failed'>('idle');

  async function savePreset() {
    const name = presetName.trim();
    if (name === '') return;
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
    <EditorSection
      title={
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-start text-base font-semibold">
            {t('participants:inviteQuestionsTitle')}
          </h2>
          <p aria-live="polite" className="text-start text-sm text-muted-foreground">
            {t('participants:inviteQuestionsSummary', {
              asked: plan.askedCount,
              total: plan.total,
            })}
          </p>
        </div>
      }
      testId="participant-choices"
    >
      <div className="flex flex-col gap-4">
        <PlayerChoicePresets
          catalog={catalog}
          onChange={onChange}
          onDeletePreset={onDeletePreset}
          isDisabled={isBusy}
        />
        <div className="flex flex-wrap items-end gap-2">
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
        {errorMessage === undefined ? null : (
          <p role="alert" className="text-start text-sm text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </EditorSection>
  );
}
