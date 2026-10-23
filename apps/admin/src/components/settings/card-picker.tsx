/**
 * A choice made from cards (RAPP-646, RAPP-647): the form shows the chosen
 * card with Change, and Change opens a dialog of every card.
 *
 * The cards are a radio group. Arrow keys move across the grid, mirrored right
 * to left; Up and Down move one row, read from the live grid; Home and End
 * jump to the ends. Enter or Space picks and closes, Escape closes, and focus
 * goes back to Change. A card that cannot be picked here stays focusable,
 * marked disabled, with its reason in its description.
 */

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

type Refs<T extends string> = RefObject<Map<T, HTMLButtonElement>>;

export function CardRadioGroup<T extends string>({
  values,
  value,
  label,
  disabled = {},
  describe,
  tooltip,
  onPick,
  cardRefs,
  className,
  testId,
  children,
}: {
  readonly values: readonly T[];
  readonly value: T;
  readonly label: string;
  /** Why a card cannot be picked here, by value. */
  readonly disabled?: Partial<Record<T, string>>;
  /** What a screen reader says after a card's name. */
  readonly describe: (value: T) => string;
  /** A short note shown on hover, when the reason is not there. */
  readonly tooltip?: (value: T) => string | undefined;
  readonly onPick: (value: T) => void;
  readonly cardRefs: Refs<T>;
  readonly className: string;
  readonly testId: string;
  /** A card's content: its picture, name and lines. */
  readonly children: (value: T) => ReactNode;
}) {
  const idPrefix = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<T>(value);

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const grid = gridRef.current;
    if (grid === null) return;
    const style = getComputedStyle(grid);
    const columns = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
    const forward = style.direction === 'rtl' ? -1 : 1;
    const last = values.length - 1;
    const index = values.indexOf(focused);
    const wrap = (next: number) => (next + last + 1) % (last + 1);
    const next =
      event.key === 'ArrowRight'
        ? wrap(index + forward)
        : event.key === 'ArrowLeft'
          ? wrap(index - forward)
          : event.key === 'ArrowDown'
            ? Math.min(index + columns, last)
            : event.key === 'ArrowUp'
              ? Math.max(index - columns, 0)
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? last
                  : null;
    if (next === null) return;
    event.preventDefault();
    const target = values[next]!;
    setFocused(target);
    cardRefs.current.get(target)?.focus();
  }

  return (
    <div
      ref={gridRef}
      role="radiogroup"
      aria-label={label}
      className={cn('grid auto-rows-fr gap-3', className)}
      onKeyDown={move}
      data-testid={testId}
    >
      {values.map((candidate) => {
        const reason = disabled[candidate];
        const noteId = `${idPrefix}-${candidate}`;
        return (
          <button
            key={candidate}
            ref={(node) => {
              if (node === null) cardRefs.current.delete(candidate);
              else cardRefs.current.set(candidate, node);
            }}
            type="button"
            role="radio"
            aria-checked={candidate === value}
            aria-disabled={reason === undefined ? undefined : true}
            aria-describedby={noteId}
            tabIndex={candidate === focused ? 0 : -1}
            title={reason ?? tooltip?.(candidate)}
            onFocus={() => setFocused(candidate)}
            onClick={() => {
              if (reason === undefined) onPick(candidate);
            }}
            className={cn(
              'flex h-full flex-col gap-2 rounded-xl border bg-card p-2 text-start outline-none',
              'transition-[background-color,border-color,box-shadow] hover:bg-muted/60',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'aria-checked:border-primary aria-checked:bg-primary/5 aria-checked:ring-1 aria-checked:ring-primary',
              'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-card',
            )}
            data-testid={`${testId}-${candidate}`}
          >
            {children(candidate)}
            <span id={noteId} className="sr-only">
              {[describe(candidate), reason].filter(Boolean).join(' ')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The form field: its label, the chosen card with Change, and the dialog.
 * Locked, the card shows without Change and the field says why.
 */
export function CardPickerField<T extends string>({
  label,
  value,
  onChange,
  isLocked,
  lockedMessage,
  media,
  name,
  description,
  dialogClassName,
  dialogNote,
  testId,
  hiddenName,
  renderGroup,
}: {
  readonly label: string;
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly isLocked: boolean;
  readonly lockedMessage: string;
  /** The chosen card's picture or icon. */
  readonly media: ReactNode;
  readonly name: string;
  readonly description: ReactNode;
  readonly dialogClassName?: string;
  /** One line under the dialog's title. */
  readonly dialogNote?: string;
  readonly testId: string;
  /** The form field that carries the value, as the dropdown did. */
  readonly hiddenName: string;
  readonly renderGroup: (props: {
    readonly cardRefs: Refs<T>;
    readonly pick: (value: T) => void;
  }) => ReactNode;
}) {
  const { t } = useTranslation('settings');
  const [isOpen, setIsOpen] = useState(false);
  const cardRefs = useRef(new Map<T, HTMLButtonElement>());
  const labelId = useId();
  const nameId = useId();
  const noteId = useId();

  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium" data-testid={testId}>
      <span id={labelId} className="text-start">
        {label}
      </span>
      <input type="hidden" name={hiddenName} value={value} disabled={isLocked} />
      <div
        role="group"
        aria-labelledby={`${labelId} ${nameId}`}
        className="flex items-center gap-3 rounded-xl border bg-card p-2"
      >
        {media}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span id={nameId} className="text-start font-medium" data-testid={`${testId}-name`}>
            {name}
          </span>
          {description}
        </div>
        {isLocked ? null : (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 self-center"
                aria-describedby={nameId}
                data-testid={`${testId}-change`}
              >
                {t('questions.picker.change')}
              </Button>
            </DialogTrigger>
            <DialogContent
              className={dialogClassName}
              aria-describedby={dialogNote === undefined ? undefined : noteId}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                cardRefs.current.get(value)?.focus();
              }}
            >
              <div className="flex flex-col gap-1">
                <DialogTitle>{label}</DialogTitle>
                {dialogNote === undefined ? null : (
                  <p id={noteId} className="text-start text-sm text-muted-foreground">
                    {dialogNote}
                  </p>
                )}
              </div>
              {renderGroup({
                cardRefs,
                pick: (next) => {
                  onChange(next);
                  setIsOpen(false);
                },
              })}
            </DialogContent>
          </Dialog>
        )}
      </div>
      {isLocked ? (
        <span className="text-start text-xs font-normal text-muted-foreground">
          {lockedMessage}
        </span>
      ) : null}
    </div>
  );
}
