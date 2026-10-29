/**
 * One field on her page (RAPP-653): the field's name, her answer, who gave it
 * and when, the per-player choice while she has not joined, and Edit. Edit
 * opens the field's input under the row.
 *
 * Every row has one height and fixed columns, so names, answers, choices and
 * buttons line up down a section and across sections, whether a row is
 * answered, locked, or has no choice or no Edit.
 */

import { ChoiceMenu } from '@/components/participants/choice-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { IntakeQuestionState } from '@ramassa/shared/intake';
import type { PlanQuestion } from '@ramassa/shared/intake-builder';

export interface RowChoice {
  readonly question: PlanQuestion;
  readonly isBusy: boolean;
  readonly onChange: (state: IntakeQuestionState) => void;
}

export interface ProfileAnswerRowProps {
  readonly name: string;
  /** Her answer in words; null when nobody gave one. */
  readonly value: ReactNode | null;
  /** Who gave it and when; null when nobody did, or nobody is recorded. */
  readonly source: string | null;
  /** Her answers of earlier seasons, one line each, behind "+N". */
  readonly older?: readonly string[];
  /** The level the reader lacks: the answer is not shown. */
  readonly lockedLevel: 'personal' | 'sensitive' | null;
  /** Her choice on this field; null when her onboarding does not ask it. */
  readonly choice: RowChoice | null;
  /** The page shows choices: every row keeps the column, with or without one. */
  readonly hasChoiceColumn: boolean;
  readonly canEdit: boolean;
  readonly isEditing: boolean;
  readonly onToggleEdit: () => void;
  /** The input, under the row while editing. */
  readonly editor?: ReactNode;
  readonly testId: string;
}

export function ProfileAnswerRow({
  name,
  value,
  source,
  older = [],
  lockedLevel,
  choice,
  hasChoiceColumn,
  canEdit,
  isEditing,
  onToggleEdit,
  editor,
  testId,
}: ProfileAnswerRowProps) {
  const { t } = useTranslation(['participants', 'profile']);
  return (
    <li data-testid={testId} data-locked={lockedLevel ?? undefined}>
      <div className="flex h-20 items-center gap-3 px-4 sm:px-5 md:h-16">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:items-center md:gap-4">
          <p className="truncate text-start text-xs text-muted-foreground md:text-sm">{name}</p>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div
              className={cn(
                'truncate text-start text-sm',
                (value === null || lockedLevel !== null) && 'text-muted-foreground',
              )}
              dir="auto"
              data-testid={`${testId}-value`}
            >
              {lockedLevel !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Lock aria-hidden className="size-3.5 shrink-0" />
                  {t(`participants:fitxa.locked.${lockedLevel}`)}
                </span>
              ) : value === null ? (
                t('profile:notProvided')
              ) : (
                value
              )}
            </div>
            <p
              className="flex min-w-0 items-center gap-1 text-start text-xs text-muted-foreground"
              data-testid={`${testId}-source`}
            >
              {/* The line is kept empty, so every row has the same height. */}
              <span className="truncate">
                {lockedLevel === null && value !== null ? (source ?? '') : ''}
              </span>
              {older.length === 0 || lockedLevel !== null ? null : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded px-1 tabular-nums underline-offset-2 hover:underline"
                      aria-label={t('fitxa.olderSeasons', { count: older.length })}
                    >
                      {`+${older.length}`}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <ul className="flex flex-col gap-0.5">
                      {older.map((line) => (
                        <li key={line} dir="auto">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              )}
            </p>
          </div>
        </div>
        {hasChoiceColumn ? (
          <span className="flex w-28 shrink-0 sm:w-36">
            {choice === null ? null : (
              <ChoiceMenu
                question={choice.question}
                name={name}
                isBusy={choice.isBusy}
                onChange={choice.onChange}
                testId={`${testId}-choice`}
              />
            )}
          </span>
        ) : null}
        <span className="flex w-16 shrink-0 justify-end">
          {canEdit ? (
            <Button
              type="button"
              variant={isEditing ? 'secondary' : 'outline'}
              size="sm"
              onClick={onToggleEdit}
              aria-expanded={isEditing}
              aria-label={t('participants:fitxa.editNamed', { field: name })}
              data-testid={`${testId}-edit`}
            >
              {t('participants:fitxa.edit')}
            </Button>
          ) : null}
        </span>
      </div>
      {isEditing && editor !== undefined ? (
        <div className="border-t bg-muted/30 px-4 py-4 sm:px-5" data-testid={`${testId}-editor`}>
          {editor}
        </div>
      ) : null}
    </li>
  );
}
