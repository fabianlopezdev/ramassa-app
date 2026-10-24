/**
 * Pick fields of the Fitxa for a surface (RAPP-651): the onboarding screen
 * editor's "Add a field", and the entity form editor's (RAPP-652).
 *
 * A dialog with the Fitxa's sections on the start side and the chosen
 * section's fields on the end side, a search above the sections that looks
 * across every section, and "New field…" as the last row, which opens the
 * Fitxa's field form with the section chosen here and ticks the new field.
 * Each row shows the type, the name, a line saying where it stands and the
 * privacy badge. A field the surface has already is ticked and dimmed; a
 * field that cannot go here is dimmed with the reason. Several fields are
 * picked at once and added with one button.
 *
 * Keyboard: Up and Down move in a list (Home and End to its ends), the
 * section list shows a section as it gets focus, Right goes from the
 * sections to the fields and Left back (mirrored right to left), Space ticks
 * a field, Enter adds the picked ones, Escape closes. Down from the search
 * goes to the fields.
 */

import type { FieldFormDraft } from '@/components/fields/field-form';
import { FieldTypeIcon } from '@/components/fields/field-type-icon';
import { PrivacyBadge } from '@/components/fields/privacy-badge';
import { FieldDialog } from '@/components/profile-layout/field-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { controllersFirst, searchFields, togglePick } from '@/lib/field-picker';
import { cn } from '@/lib/utils';
import { Check, Plus, Search, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fieldsOfSection,
  textIn,
  type ProfileField,
  type ProfileLayout,
  type ProfileSection,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** Where a field stands for this surface, and the line its row shows. */
export type FieldPickState =
  /** Already here: ticked and dimmed. */
  | { readonly kind: 'placed'; readonly note: string }
  /** Cannot go here: dimmed, with the reason. */
  | { readonly kind: 'blocked'; readonly note: string }
  | { readonly kind: 'free' };

export interface FieldPickerProps {
  readonly layout: ProfileLayout;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** The section the picker opens on; the first one when null. */
  readonly initialSectionId: string | null;
  readonly stateOf: (field: ProfileField) => FieldPickState;
  /** Adds the picked fields, a controlling field before its conditions. */
  readonly onConfirm: (fieldIds: readonly string[]) => Promise<void>;
  /** Creates a field in a section and returns its id; left out, there is no "New field…". */
  readonly onCreateField?: (section: ProfileSection, draft: FieldFormDraft) => Promise<string>;
  readonly testId?: string;
}

export function FieldPicker(props: FieldPickerProps) {
  return (
    <Dialog open={props.isOpen} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="flex max-w-3xl flex-col gap-0 overflow-hidden p-0"
        data-testid={props.testId ?? 'field-picker'}
      >
        {/* Mounted while open: each opening starts from nothing picked. */}
        {props.isOpen ? <PickerBody {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Moves focus in a list of buttons by the arrow keys; returns whether it moved. */
function moveIn(event: KeyboardEvent, items: readonly HTMLElement[]): boolean {
  const index = items.indexOf(document.activeElement as HTMLElement);
  const last = items.length - 1;
  const next =
    event.key === 'ArrowDown'
      ? Math.min(index + 1, last)
      : event.key === 'ArrowUp'
        ? Math.max(index - 1, 0)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null;
  if (next === null || last < 0) return false;
  event.preventDefault();
  items[next]?.focus();
  return true;
}

function PickerBody({
  layout,
  onOpenChange,
  title,
  initialSectionId,
  stateOf,
  onConfirm,
  onCreateField,
  testId = 'field-picker',
}: FieldPickerProps) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const ids = useId();
  const [sectionId, setSectionId] = useState<string | null>(
    initialSectionId ?? layout.sections[0]?.id ?? null,
  );
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  const section = layout.sections.find((each) => each.id === sectionId) ?? layout.sections[0];
  const isSearching = query.trim() !== '';
  const shown: readonly ProfileField[] = isSearching
    ? searchFields(layout, query)
    : section === undefined
      ? []
      : fieldsOfSection(layout, section.id);
  // Search results under their sections' names, in the Fitxa's order.
  const groups: readonly { readonly section: ProfileSection; readonly fields: ProfileField[] }[] =
    layout.sections.flatMap((each) => {
      const fields = shown.filter((field) => field.sectionId === each.id);
      return fields.length === 0 ? [] : [{ section: each, fields }];
    });
  const canPick = (id: string) => {
    const field = layout.fields.find((each) => each.id === id);
    return field !== undefined && stateOf(field).kind === 'free';
  };
  const sectionName = (each: ProfileSection) => textIn(each.title, language);
  const isRtl = () => getComputedStyle(optionsRef.current ?? document.body).direction === 'rtl';

  const items = (container: HTMLElement | null): HTMLElement[] =>
    container === null ? [] : [...container.querySelectorAll<HTMLElement>('[data-picker-item]')];

  function toggle(field: ProfileField) {
    if (!canPick(field.id)) return;
    setPicked((current) => togglePick(layout, current, field.id, canPick));
  }

  async function confirm() {
    // A field picked earlier may have been placed meanwhile (another tab).
    const chosen = [...picked].filter(canPick);
    if (chosen.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      await onConfirm(controllersFirst(layout, chosen));
      onOpenChange(false);
    } catch {
      toast.error(t('fieldPicker.failed'));
    } finally {
      setIsSaving(false);
    }
  }

  function onSectionKey(event: KeyboardEvent<HTMLDivElement>) {
    const toFields = isRtl() ? 'ArrowLeft' : 'ArrowRight';
    if (event.key === toFields) {
      event.preventDefault();
      items(optionsRef.current)[0]?.focus();
      return;
    }
    moveIn(event, items(sectionsRef.current));
  }

  function onOptionKey(event: KeyboardEvent<HTMLDivElement>) {
    const toSections = isRtl() ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === toSections) {
      event.preventDefault();
      const current = items(sectionsRef.current).find((each) => each.dataset.current === 'true');
      (current ?? items(sectionsRef.current)[0])?.focus();
      return;
    }
    if (event.key === 'Enter' && (event.target as HTMLElement).dataset.pickerNew === undefined) {
      event.preventDefault();
      void confirm();
      return;
    }
    moveIn(event, items(optionsRef.current));
  }

  const count = [...picked].filter(canPick).length;

  return (
    <>
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <DialogTitle className="min-w-0 flex-1 truncate text-lg">{title}</DialogTitle>
        <DialogDescription className="sr-only">{t('fieldPicker.description')}</DialogDescription>
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('fieldPicker.close')}>
            <X aria-hidden />
          </Button>
        </DialogClose>
      </div>
      <div className="flex min-h-0 flex-col sm:h-[28rem] sm:flex-row">
        <div className="flex flex-col gap-2 border-b p-3 sm:w-56 sm:shrink-0 sm:border-e sm:border-b-0">
          <label htmlFor={`${ids}-search`} className="sr-only">
            {t('fieldPicker.search')}
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={`${ids}-search`}
              type="search"
              value={query}
              placeholder={t('fieldPicker.searchPlaceholder')}
              className="ps-8"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  items(optionsRef.current)[0]?.focus();
                }
              }}
              data-testid={`${testId}-search`}
            />
          </div>
          <div
            ref={sectionsRef}
            role="group"
            aria-label={t('fieldPicker.sections')}
            className="flex max-h-36 flex-col gap-0.5 overflow-y-auto sm:max-h-none"
            onKeyDown={onSectionKey}
          >
            {layout.sections.map((each) => {
              const isCurrent = !isSearching && each.id === section?.id;
              return (
                <button
                  key={each.id}
                  type="button"
                  data-picker-item=""
                  data-current={isCurrent ? 'true' : 'false'}
                  aria-current={isCurrent ? 'true' : undefined}
                  tabIndex={each.id === section?.id ? 0 : -1}
                  onFocus={() => {
                    setQuery('');
                    setSectionId(each.id);
                  }}
                  onClick={() => {
                    setQuery('');
                    setSectionId(each.id);
                  }}
                  className={cn(
                    'flex h-9 shrink-0 items-center justify-between gap-2 rounded-md px-3 text-start text-sm outline-none',
                    'hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                    isCurrent && 'bg-muted font-semibold text-primary',
                  )}
                  data-testid={`${testId}-section-${each.key}`}
                >
                  <span className="truncate">{sectionName(each)}</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">
                    {fieldsOfSection(layout, each.id).length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div
          ref={optionsRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={
            isSearching
              ? t('fieldPicker.results')
              : section === undefined
                ? ''
                : sectionName(section)
          }
          className="flex min-h-48 flex-1 flex-col overflow-y-auto py-2"
          onKeyDown={onOptionKey}
          data-testid={`${testId}-fields`}
        >
          {isSearching && groups.length === 0 ? (
            <p className="px-5 py-3 text-start text-sm text-muted-foreground">
              {t('fieldPicker.noResults')}
            </p>
          ) : null}
          {(isSearching
            ? groups
            : section === undefined
              ? []
              : [{ section, fields: [...shown] }]
          ).map((group, groupIndex) => (
            <div
              key={group.section.id}
              role="group"
              aria-labelledby={`${ids}-group-${group.section.id}`}
            >
              <p
                id={`${ids}-group-${group.section.id}`}
                className="flex h-8 items-center px-5 text-start text-xs font-semibold text-muted-foreground uppercase"
              >
                {sectionName(group.section)}
              </p>
              {group.fields.map((field, index) => (
                <FieldOption
                  key={field.id}
                  field={field}
                  state={stateOf(field)}
                  isPicked={picked.has(field.id)}
                  sectionName={isSearching ? sectionName(group.section) : null}
                  isFirst={groupIndex === 0 && index === 0}
                  onToggle={() => toggle(field)}
                  testId={`${testId}-field-${field.id}`}
                />
              ))}
            </div>
          ))}
          {!isSearching && section !== undefined && shown.length === 0 ? (
            <p className="px-5 py-3 text-start text-sm text-muted-foreground">
              {t('profileLayout.emptySection')}
            </p>
          ) : null}
          {onCreateField === undefined || section === undefined ? null : (
            <button
              type="button"
              role="option"
              aria-selected={false}
              data-picker-item=""
              data-picker-new=""
              tabIndex={shown.length === 0 ? 0 : -1}
              onClick={() => setIsCreating(true)}
              onKeyDown={(event) => {
                if (event.key === ' ') {
                  event.preventDefault();
                  setIsCreating(true);
                }
              }}
              className={cn(
                'mt-auto flex h-14 shrink-0 items-center gap-3 border-t border-dashed px-5 text-start text-primary outline-none',
                'hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
              )}
              data-testid={`${testId}-new`}
            >
              <span
                aria-hidden
                className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-dashed border-primary"
              >
                <Plus className="size-3" />
              </span>
              <span aria-hidden className="size-8 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{t('fieldPicker.newField')}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t('fieldPicker.newFieldIn', { section: sectionName(section) })}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t('onboardingBoard.cancel')}
        </Button>
        <Button
          type="button"
          disabled={count === 0 || isSaving}
          onClick={() => void confirm()}
          data-testid={`${testId}-confirm`}
        >
          {count === 0 ? t('fieldPicker.addNone') : t('fieldPicker.add', { count })}
        </Button>
      </div>
      {onCreateField === undefined || section === undefined ? null : (
        <FieldDialog
          section={section}
          field={null}
          isOpen={isCreating}
          onOpenChange={setIsCreating}
          onSave={async (draft) => {
            const id = await onCreateField(section, draft);
            setPicked((current) => new Set([...current, id]));
          }}
        />
      )}
    </>
  );
}

function FieldOption({
  field,
  state,
  isPicked,
  sectionName,
  isFirst,
  onToggle,
  testId,
}: {
  readonly field: ProfileField;
  readonly state: FieldPickState;
  readonly isPicked: boolean;
  /** Shown before the line in search results, which mix sections. */
  readonly sectionName: string | null;
  readonly isFirst: boolean;
  readonly onToggle: () => void;
  readonly testId: string;
}) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const isTicked = state.kind === 'placed' || (state.kind === 'free' && isPicked);
  const line = state.kind === 'free' ? t(`questions.types.${field.type}`) : state.note;
  return (
    <button
      type="button"
      role="option"
      aria-selected={isTicked}
      aria-disabled={state.kind === 'free' ? undefined : true}
      data-picker-item=""
      tabIndex={isFirst ? 0 : -1}
      title={state.kind === 'free' ? undefined : state.note}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        'flex h-14 w-full shrink-0 items-center gap-3 px-5 text-start outline-none',
        'hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
        'aria-disabled:cursor-not-allowed',
      )}
      data-testid={testId}
      data-state={state.kind}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input',
          isTicked && 'border-primary bg-primary text-primary-foreground',
          state.kind !== 'free' && 'opacity-50',
        )}
      >
        {isTicked ? <Check className="size-3" /> : null}
      </span>
      <span
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3',
          state.kind !== 'free' && 'opacity-50',
        )}
      >
        <FieldTypeIcon type={field.type} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{textIn(field.label, language)}</span>
          <span className="truncate text-xs text-muted-foreground">
            {sectionName === null ? line : `${sectionName} · ${line}`}
          </span>
        </span>
        <span className="flex w-20 shrink-0 justify-end">
          <PrivacyBadge level={field.privacy} />
        </span>
      </span>
    </button>
  );
}
