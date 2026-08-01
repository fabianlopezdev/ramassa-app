/**
 * The roster's filter bar (RAPP-23).
 *
 * The search box is the only control here that keeps state of its own, and only
 * the keystrokes it has not committed yet. Committing per keystroke would send
 * a query per letter and push a history entry per letter, so the back button
 * would walk backwards through "a", "am", "ami"; committing only on Enter
 * hides results behind a key most people never press on a search box. It
 * commits on a pause instead.
 *
 * The dropdowns commit immediately: a select is a decision, not a draft.
 */

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParticipantFilterOptions, ParticipantSearch } from '@ramassa/shared/participants';

/**
 * Long enough that ordinary typing produces one query rather than eight, short
 * enough that the table feels like it is keeping up. Tuned for a staff laptop
 * on the shelter's connection, not for a demo on fibre.
 */
const SEARCH_DEBOUNCE_MS = 300;

export interface ParticipantsFiltersProps {
  readonly search: ParticipantSearch;
  readonly filterOptions: ParticipantFilterOptions;
  readonly onChange: (next: Partial<ParticipantSearch>) => void;
}

export function ParticipantsFilters({ search, filterOptions, onChange }: ParticipantsFiltersProps) {
  const { t } = useTranslation('participants');
  const [draftQuery, setDraftQuery] = useState(search.q);

  // The URL is the source of truth, so a back/forward navigation or a cleared
  // filter has to be reflected in the box: without this the input keeps a term
  // the table is no longer filtered by.
  useEffect(() => {
    setDraftQuery(search.q);
  }, [search.q]);

  useEffect(() => {
    if (draftQuery === search.q) return;
    const timer = setTimeout(() => onChange({ q: draftQuery }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftQuery, search.q, onChange]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-64 flex-col gap-1">
        <span className="text-sm font-medium">{t('searchLabel')}</span>
        <Input
          type="search"
          value={draftQuery}
          placeholder={t('searchPlaceholder')}
          onChange={(event) => setDraftQuery(event.target.value)}
        />
        {/* Says what search does NOT cover. Without it, a staff member typing a
            document number concludes the search is broken, when in fact those
            columns are encrypted and deliberately unsearchable. */}
        <span className="text-xs text-muted-foreground">{t('searchHint')}</span>
      </label>

      <FilterSelect
        label={t('filterEntity')}
        value={search.entity ?? ''}
        allLabel={t('optionAll')}
        options={filterOptions.entities}
        onSelect={(value) => onChange({ entity: value === '' ? null : value })}
      />
      <FilterSelect
        label={t('filterNationality')}
        value={search.nationality ?? ''}
        allLabel={t('optionAll')}
        options={filterOptions.nationalities}
        onSelect={(value) => onChange({ nationality: value === '' ? null : value })}
      />
      <FilterSelect
        label={t('filterStatus')}
        value={search.status}
        allLabel={t('optionAll')}
        options={[
          { value: 'active', label: t('statusActive') },
          { value: 'inactive', label: t('statusInactive') },
        ]}
        allValue="all"
        onSelect={(value) => onChange({ status: value as ParticipantSearch['status'] })}
      />
      <FilterSelect
        label={t('filterDependents')}
        value={search.dependents}
        allLabel={t('optionAllMasc')}
        options={[
          { value: 'with', label: t('dependentsWith') },
          { value: 'without', label: t('dependentsWithout') },
        ]}
        allValue="all"
        onSelect={(value) => onChange({ dependents: value as ParticipantSearch['dependents'] })}
      />
    </div>
  );
}

type SelectOption = string | { value: string; label: string };

/**
 * A native `<select>`, deliberately. It is keyboard accessible, screen-reader
 * announced and touch-friendly on every platform without a line of code, and
 * the roster's filters are exactly the plain one-of-many choice it was designed
 * for. A custom listbox here would be work spent re-implementing behaviour the
 * browser already gets right.
 */
function FilterSelect({
  label,
  value,
  options,
  allLabel,
  allValue = '',
  onSelect,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  allLabel: string;
  allValue?: string;
  onSelect: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onSelect(event.target.value)}
        className={cn(
          'h-9 min-w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none',
        )}
      >
        <option value={allValue}>{allLabel}</option>
        {options.map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}
