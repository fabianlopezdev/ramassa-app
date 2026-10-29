/**
 * One field on her page (RAPP-653): the field's name, her answer, who gave it
 * and when, the per-player choice while she has not joined, and Edit. Edit
 * opens the field's input under the row.
 *
 * Names and answers share columns. Values wrap when they need more room,
 * and an editor is available only when the reader may change the field.
 */

import { ChoiceMenu } from '@/components/participants/choice-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Lock, Pencil } from 'lucide-react';
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
  readonly showEditAction?: boolean;
  readonly inset?: boolean;
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
  showEditAction = true,
  inset = false,
  isEditing,
  onToggleEdit,
  editor,
  testId,
}: ProfileAnswerRowProps) {
  const { t } = useTranslation(['participants', 'profile']);
  return (
    <li data-testid={testId} data-locked={lockedLevel ?? undefined}>
      <div className={cn('flex min-h-11 items-center gap-3 py-2.5', !inset && 'px-5')}>
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:grid sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center sm:gap-5">
          <p className="text-start text-sm break-words text-muted-foreground">{name}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'text-start text-sm break-words',
                    (value === null || lockedLevel !== null) && 'text-muted-foreground',
                  )}
                  dir="auto"
                  tabIndex={source !== null && lockedLevel === null ? 0 : undefined}
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
              </TooltipTrigger>
              {source !== null && lockedLevel === null ? (
                <TooltipContent>{source}</TooltipContent>
              ) : null}
            </Tooltip>
            <p
              className="flex min-w-0 items-center gap-1 text-start text-xs text-muted-foreground empty:hidden"
              data-testid={`${testId}-source`}
            >
              {source !== null && lockedLevel === null && value !== null ? (
                <span className="sr-only">{source}</span>
              ) : null}
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
        {canEdit && showEditAction ? (
          <span className="flex shrink-0 justify-end">
            <Button
              type="button"
              variant={isEditing ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={onToggleEdit}
              aria-expanded={isEditing}
              aria-label={t('participants:fitxa.editNamed', { field: name })}
              data-testid={`${testId}-edit`}
            >
              <Pencil aria-hidden className="size-4" />
            </Button>
          </span>
        ) : null}
      </div>
      {isEditing && editor !== undefined ? (
        <div className="border-t bg-muted/30 px-4 py-4 sm:px-5" data-testid={`${testId}-editor`}>
          {editor}
        </div>
      ) : null}
    </li>
  );
}
