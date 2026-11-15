/**
 * The per-player choice on one field of her page (RAPP-653): Automàtic,
 * Pregunta-ho or No ho preguntis, with the invitation's rules (RAPP-301,
 * RAPP-645). Don't ask is not offered on a required field nobody answered,
 * and the menu says why. A compact button, so the row keeps one height at
 * every width.
 */

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { IntakeQuestionState } from '@ramassa/shared/intake';
import type { PlanQuestion } from '@ramassa/shared/intake-builder';

export const CHOICE_LABEL_KEYS: Readonly<Record<IntakeQuestionState, string>> = {
  auto: 'participants:inviteChoiceAuto',
  ask: 'participants:inviteChoiceAsk',
  skip: 'participants:inviteChoiceSkip',
};

export function ChoiceMenu({
  question,
  name,
  isBusy,
  onChange,
  testId,
}: {
  readonly question: PlanQuestion;
  /** The field's name, for the button's accessible name. */
  readonly name: string;
  readonly isBusy: boolean;
  readonly onChange: (state: IntakeQuestionState) => void;
  readonly testId: string;
}) {
  const { t } = useTranslation('participants');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isBusy}
          className="w-full justify-between gap-1 px-2.5 font-normal"
          aria-label={t('participants:fitxa.choiceNamed', {
            field: name,
            choice: t(CHOICE_LABEL_KEYS[question.state]),
          })}
          data-testid={testId}
          data-state-choice={question.state}
        >
          <span className="truncate">{t(CHOICE_LABEL_KEYS[question.state])}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={question.state}
          onValueChange={(next) => onChange(next as IntakeQuestionState)}
        >
          {(['auto', 'ask', 'skip'] as const).map((state) => (
            <DropdownMenuRadioItem
              key={state}
              value={state}
              disabled={state === 'skip' && !question.canSkip}
              data-testid={`${testId}-${state}`}
            >
              {t(CHOICE_LABEL_KEYS[state])}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {question.canSkip ? null : (
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t('participants:questionStatesRequiredHint')}
          </DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
