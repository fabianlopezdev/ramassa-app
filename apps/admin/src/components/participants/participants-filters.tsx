/** Participants filtering stays in the URL; only uncommitted search keystrokes are local. */
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ParticipantListColumns } from '@/lib/participant-list';
import { Info, Search, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParticipantFilterOptions, ParticipantSearch } from '@ramassa/shared/participants';

const SEARCH_DEBOUNCE_MS = 300;

export interface ParticipantsFiltersProps {
  readonly search: ParticipantSearch;
  readonly filterOptions: ParticipantFilterOptions;
  readonly onChange: (next: Partial<ParticipantSearch>) => void;
  readonly shown?: Pick<ParticipantListColumns, 'nationality' | 'entity' | 'dependents'>;
}

const ALL_FILTERS = { nationality: true, entity: true, dependents: true } as const;
export const CLEARED_PARTICIPANT_FILTERS = {
  q: '',
  entity: null,
  nationality: null,
  status: 'all',
  dependents: 'all',
} as const;

export function hasParticipantFilters(search: ParticipantSearch): boolean {
  return (
    search.q !== '' ||
    search.entity !== null ||
    search.nationality !== null ||
    search.status !== 'all' ||
    search.dependents !== 'all'
  );
}

export function ParticipantsFilters({
  search,
  filterOptions,
  onChange,
  shown = ALL_FILTERS,
}: ParticipantsFiltersProps) {
  const { t } = useTranslation('participants');
  const searchId = useId();
  const hintId = useId();
  const [draftQuery, setDraftQuery] = useState(search.q);
  useEffect(() => setDraftQuery(search.q), [search.q]);
  useEffect(() => {
    if (draftQuery === search.q) return;
    const timer = setTimeout(() => onChange({ q: draftQuery }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftQuery, search.q, onChange]);

  function change(next: Partial<ParticipantSearch>) {
    if (next.q !== undefined) setDraftQuery(next.q);
    onChange(next);
  }
  const statusLabel =
    search.status === 'active'
      ? t('statusActive')
      : search.status === 'inactive'
        ? t('statusInactive')
        : t('statusInvited');
  const active: { key: string; label: string; value: string; clear: Partial<ParticipantSearch> }[] =
    [
      ...(search.q === ''
        ? []
        : [{ key: 'q', label: t('searchLabel'), value: search.q, clear: { q: '' } }]),
      ...(search.entity === null
        ? []
        : [
            {
              key: 'entity',
              label: t('filterEntity'),
              value: search.entity,
              clear: { entity: null },
            },
          ]),
      ...(search.nationality === null
        ? []
        : [
            {
              key: 'nationality',
              label: t('filterNationality'),
              value: search.nationality,
              clear: { nationality: null },
            },
          ]),
      ...(search.status === 'all'
        ? []
        : [
            {
              key: 'status',
              label: t('filterStatus'),
              value: statusLabel,
              clear: { status: 'all' as const },
            },
          ]),
      ...(search.dependents === 'all'
        ? []
        : [
            {
              key: 'dependents',
              label: t('filterDependents'),
              value: search.dependents === 'with' ? t('dependentsWith') : t('dependentsWithout'),
              clear: { dependents: 'all' as const },
            },
          ]),
    ];
  return (
    <div className="flex flex-col gap-4" data-testid="participants-filters">
      <div className="flex flex-wrap items-center gap-3">
        <Field className="min-w-0 flex-1 basis-64">
          <FieldLabel htmlFor={searchId} className="sr-only">
            {t('searchLabel')}
          </FieldLabel>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              value={draftQuery}
              placeholder={t('searchPlaceholder')}
              className="ps-9 pe-10"
              aria-describedby={hintId}
              onChange={(event) => setDraftQuery(event.target.value)}
            />
            <span id={hintId} className="sr-only">
              {t('searchHint')}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={t('searchHint')}
                >
                  <Info aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('searchHint')}</TooltipContent>
            </Tooltip>
          </div>
        </Field>
        {active.length === 0 && draftQuery === '' ? null : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => change(CLEARED_PARTICIPANT_FILTERS)}
            data-testid="participants-clear-filters"
          >
            <X aria-hidden data-icon="inline-start" />
            {t('clearFilters')}
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.entity ? (
          <FilterSelect
            label={t('filterEntity')}
            value={search.entity ?? ''}
            allLabel={t('optionAll')}
            options={filterOptions.entities}
            onSelect={(value) => change({ entity: value === '' ? null : value })}
          />
        ) : null}
        {shown.nationality ? (
          <FilterSelect
            label={t('filterNationality')}
            value={search.nationality ?? ''}
            allLabel={t('optionAll')}
            options={filterOptions.nationalities}
            onSelect={(value) => change({ nationality: value === '' ? null : value })}
          />
        ) : null}
        <FilterSelect
          label={t('filterStatus')}
          value={search.status}
          allLabel={t('optionAll')}
          options={[
            { value: 'active', label: t('statusActive') },
            { value: 'inactive', label: t('statusInactive') },
            { value: 'invited', label: t('statusInvited') },
          ]}
          allValue="all"
          onSelect={(value) => change({ status: value as ParticipantSearch['status'] })}
        />
        {shown.dependents ? (
          <FilterSelect
            label={t('filterDependents')}
            value={search.dependents}
            allLabel={t('optionAll')}
            options={[
              { value: 'with', label: t('dependentsWith') },
              { value: 'without', label: t('dependentsWithout') },
            ]}
            allValue="all"
            onSelect={(value) => change({ dependents: value as ParticipantSearch['dependents'] })}
          />
        ) : null}
      </div>
      {active.length === 0 ? null : (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('activeFilters')}>
          {active.map((filter) => (
            <Button
              key={filter.key}
              type="button"
              variant="outline"
              size="sm"
              className="max-w-full"
              onClick={() => change(filter.clear)}
              aria-label={t('removeFilter', { filter: `${filter.label}: ${filter.value}` })}
            >
              <span className="truncate">
                {filter.label}: {filter.value}
              </span>
              <X aria-hidden data-icon="inline-end" />
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

type SelectOption = string | { value: string; label: string };

function FilterSelect({
  label,
  value,
  options,
  allLabel,
  allValue = '',
  onSelect,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly allLabel: string;
  readonly allValue?: string;
  readonly onSelect: (value: string) => void;
}) {
  const id = useId();
  const { i18n } = useTranslation();
  const entries = options.map((option) =>
    typeof option === 'string' ? { value: option, label: option } : option,
  );
  if (value !== allValue && !entries.some((entry) => entry.value === value))
    entries.unshift({ value, label: value });
  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        dir={i18n.dir()}
        value={value === allValue ? 'all' : `value:${value}`}
        onValueChange={(next) => onSelect(next === 'all' ? allValue : next.slice(6))}
      >
        <SelectTrigger id={id} className="h-9 w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="all">{allLabel}</SelectItem>
          {entries.map((option) => (
            <SelectItem key={option.value} value={`value:${option.value}`}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
