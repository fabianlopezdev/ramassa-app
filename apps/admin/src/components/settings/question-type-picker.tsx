/**
 * The type of a question, picked by its picture (RAPP-646): every type as a
 * tile with a small drawing of her phone's control, answered with sample
 * words, and its name. The form shows the chosen tile with Change; Change
 * opens all fifteen in a dialog.
 *
 * The drawings are `QuestionControl`, the control the editor's phone preview
 * draws, in its example mode. The tiles are a radio group: arrow keys move
 * across the grid (mirrored right to left), Enter or Space picks, Escape
 * closes. A type that cannot be used here shows its tile disabled with the
 * reason; a type that works with a caveat keeps its tile and says why.
 */

import { QuestionControl, TypeDescription } from '@/components/settings/question-type-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TriangleAlert } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  CUSTOM_QUESTION_TYPES,
  type BuilderText,
  type CustomQuestionType,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** Why a type cannot be picked here, or what to know before picking it, by type. */
export type TypeNotes = Partial<Record<CustomQuestionType, string>>;

/** The admin's own language, so the pictures read in it. */
function useUiLanguage(): LanguageCode {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'ca';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(language)
    ? (language as LanguageCode)
    : 'ca';
}

/** One type drawn small, answered with sample words in the admin's language. */
export function TypeMiniature({
  type,
  language,
}: {
  readonly type: CustomQuestionType;
  readonly language: LanguageCode;
}) {
  const { t } = useTranslation('settings');
  const sample = (key: string): BuilderText => ({
    [language]: t(`questions.typeSamples.${key}`, { lng: language }),
  });
  const options =
    type === 'single_choice' || type === 'multiple_choice'
      ? [sample('option1'), sample('option2'), sample('option3')]
      : type === 'search_choice'
        ? [sample('search1'), sample('search2')]
        : [];
  return (
    <div
      aria-hidden
      inert
      lang={language}
      dir={getLanguageDirection(language)}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-canvas"
    >
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-2 px-3 [zoom:0.6]">
        <span className="h-2 w-1/2 shrink-0 rounded-full bg-foreground/15" />
        <QuestionControl
          draft={{
            type,
            label: {},
            help: {},
            settings: type === 'file_upload' ? { accept: 'document' } : {},
            options,
          }}
          language={language}
          isExample
        />
      </div>
    </div>
  );
}

function TypeGrid({
  value,
  disabled,
  warnings,
  onPick,
  tileRefs,
}: {
  readonly value: CustomQuestionType;
  readonly disabled: TypeNotes;
  readonly warnings: TypeNotes;
  readonly onPick: (type: CustomQuestionType) => void;
  readonly tileRefs: RefObject<Map<CustomQuestionType, HTMLButtonElement>>;
}) {
  const { t } = useTranslation('settings');
  const language = useUiLanguage();
  const idPrefix = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<CustomQuestionType>(value);

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const grid = gridRef.current;
    if (grid === null) return;
    const style = getComputedStyle(grid);
    const columns = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
    const forward = style.direction === 'rtl' ? -1 : 1;
    const last = CUSTOM_QUESTION_TYPES.length - 1;
    const index = CUSTOM_QUESTION_TYPES.indexOf(focused);
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
    const type = CUSTOM_QUESTION_TYPES[next]!;
    setFocused(type);
    tileRefs.current.get(type)?.focus();
  }

  return (
    <div
      ref={gridRef}
      role="radiogroup"
      aria-label={t('questions.type')}
      className="grid auto-rows-fr grid-cols-3 gap-3 md:grid-cols-5"
      onKeyDown={move}
      data-testid="question-type-grid"
    >
      {CUSTOM_QUESTION_TYPES.map((type) => {
        const isChecked = type === value;
        const reason = disabled[type];
        const warning = warnings[type];
        const noteId = `${idPrefix}-${type}`;
        return (
          <button
            key={type}
            ref={(node) => {
              if (node === null) tileRefs.current.delete(type);
              else tileRefs.current.set(type, node);
            }}
            type="button"
            role="radio"
            aria-checked={isChecked}
            aria-disabled={reason === undefined ? undefined : true}
            aria-describedby={noteId}
            tabIndex={type === focused ? 0 : -1}
            title={reason ?? warning}
            onFocus={() => setFocused(type)}
            onClick={() => {
              if (reason === undefined) onPick(type);
            }}
            className={cn(
              'flex h-full flex-col gap-2 rounded-xl border bg-card p-2 text-start outline-none',
              'transition-[background-color,border-color,box-shadow] hover:bg-muted/60',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'aria-checked:border-primary aria-checked:bg-primary/5 aria-checked:ring-1 aria-checked:ring-primary',
              'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-card',
            )}
            data-testid={`question-type-option-${type}`}
          >
            <span className="relative block w-full">
              <TypeMiniature type={type} language={language} />
              {warning === undefined && reason === undefined ? null : (
                <TriangleAlert
                  aria-hidden
                  className="absolute end-1.5 top-1.5 size-4 rounded-full bg-card p-0.5 text-destructive"
                />
              )}
            </span>
            <span className="line-clamp-3 min-h-15 text-sm leading-5 font-medium md:line-clamp-2 md:min-h-10">
              {t(`questions.types.${type}`)}
            </span>
            <span id={noteId} className="sr-only">
              {[t(`questions.typeHelp.${type}`), reason ?? warning].filter(Boolean).join(' ')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The type field of the question form: the chosen tile, and Change for the
 * grid while the question is new. A hidden `question-type` input carries the
 * value in the form, as the dropdown did.
 */
export function QuestionTypePicker({
  value,
  onChange,
  isLocked,
  disabled = {},
  warnings = {},
}: {
  readonly value: CustomQuestionType;
  readonly onChange: (type: CustomQuestionType) => void;
  /** An existing question keeps its type: the tile shows without Change. */
  readonly isLocked: boolean;
  readonly disabled?: TypeNotes;
  readonly warnings?: TypeNotes;
}) {
  const { t } = useTranslation('settings');
  const language = useUiLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const tileRefs = useRef(new Map<CustomQuestionType, HTMLButtonElement>());
  const labelId = useId();
  const nameId = useId();

  return (
    <div className="flex flex-col gap-1.5 text-sm font-medium" data-testid="question-type">
      <span id={labelId} className="text-start">
        {t('questions.type')}
      </span>
      <input type="hidden" name="question-type" value={value} disabled={isLocked} />
      <div
        role="group"
        aria-labelledby={`${labelId} ${nameId}`}
        className="flex items-center gap-3 rounded-xl border bg-card p-2"
      >
        <div className="w-28 shrink-0">
          <TypeMiniature type={value} language={language} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span id={nameId} className="text-start font-medium" data-testid="question-type-name">
            {t(`questions.types.${value}`)}
          </span>
          <TypeDescription type={value} />
        </div>
        {isLocked ? null : (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 self-center"
                aria-describedby={nameId}
                data-testid="question-type-change"
              >
                {t('questions.typePicker.change')}
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-4xl"
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                tileRefs.current.get(value)?.focus();
              }}
            >
              <DialogTitle>{t('questions.type')}</DialogTitle>
              <TypeGrid
                value={value}
                disabled={disabled}
                warnings={warnings}
                tileRefs={tileRefs}
                onPick={(type) => {
                  onChange(type);
                  setIsOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
      {isLocked ? (
        <span className="text-start text-xs font-normal text-muted-foreground">
          {t('questions.typeLocked')}
        </span>
      ) : null}
    </div>
  );
}
