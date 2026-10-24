/**
 * The presets that fill every per-player choice at once (RAPP-307, RAPP-645):
 * "only what is missing", "she reviews everything", and the organization's
 * own, which her page can also delete. The invitation's board and her page
 * share them.
 */

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QuestionStates } from '@ramassa/shared/intake';
import {
  PLAYER_PRESETS,
  presetChoices,
  type IntakeCatalog,
  type IntakePreset,
  type PlayerChoices,
} from '@ramassa/shared/intake-builder';

export function PlayerChoicePresets({
  catalog,
  onChange,
  onDeletePreset,
  isDisabled = false,
}: {
  readonly catalog: IntakeCatalog;
  readonly onChange: (next: PlayerChoices) => void;
  readonly onDeletePreset?: (preset: IntakePreset) => void;
  readonly isDisabled?: boolean;
}) {
  const { t } = useTranslation('participants');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isDisabled}
        onClick={() => onChange(PLAYER_PRESETS.missing(catalog))}
      >
        {t('participants:questionStatesPresetMissing')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isDisabled}
        onClick={() => onChange(PLAYER_PRESETS.review(catalog))}
      >
        {t('participants:questionStatesPresetReview')}
      </Button>
      {catalog.presets.map((preset) => (
        <span key={preset.id} className="inline-flex items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDisabled}
            className={onDeletePreset === undefined ? undefined : 'rounded-e-none'}
            onClick={() => onChange(presetChoices(catalog, preset.states as QuestionStates, false))}
          >
            {preset.name}
          </Button>
          {onDeletePreset === undefined ? null : (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-s-none border-s-0"
              aria-label={t('participants:questionStatesDeletePreset', { name: preset.name })}
              onClick={() => onDeletePreset(preset)}
            >
              <X aria-hidden />
            </Button>
          )}
        </span>
      ))}
    </div>
  );
}
