/**
 * A searchable pick from a list the app ships (RAPP-665): every country, or
 * the 947 municipalities of Catalonia (D6). She types any part of a name in any
 * language (`searchCountries`, `searchMunicipalities`) and picks one from the
 * list under the input; the stored value is the canonical Catalan name. A
 * hidden input carries it, so an uncontrolled form reads it with FormData.
 *
 * It follows the WAI-ARIA combobox pattern with a listbox popup: arrow keys
 * move, Enter picks, Escape closes. No new dependency: shadcn's combobox needs
 * `@base-ui/react`.
 */

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { getCountryOptions, searchCountries } from '@ramassa/shared/i18n/countries';
import { getMunicipalityOptions, searchMunicipalities } from '@ramassa/shared/i18n/municipalities';
import type { LanguageCode } from '@ramassa/shared/schemas';

export type AppListKind = 'country' | 'municipality';

/** The most a list shows at once: typing narrows it. */
const SHOWN = 50;

interface ListOption {
  readonly value: string;
  readonly label: string;
}

/** The options of a list in a language, filtered by what she typed. */
export function appListMatches(
  kind: AppListKind,
  language: LanguageCode,
  query: string,
): readonly ListOption[] {
  const found =
    kind === 'country'
      ? searchCountries(getCountryOptions(language), query)
      : searchMunicipalities(getMunicipalityOptions(language), query);
  return found.map((option) => ({ value: option.canonical, label: option.label }));
}

/** The label of a stored canonical name; a name the list no longer has reads as stored. */
function appListLabel(kind: AppListKind, language: LanguageCode, value: string): string {
  const options =
    kind === 'country' ? getCountryOptions(language) : getMunicipalityOptions(language);
  return options.find((option) => option.canonical === value)?.label ?? value;
}

export function ListPicker({
  kind,
  language,
  id,
  name,
  value,
  onChange,
  noneLabel,
  className,
  isRequired = false,
  describedBy,
  testId,
}: {
  readonly kind: AppListKind;
  readonly language: LanguageCode;
  readonly id: string;
  /** The form name of the hidden input that carries the canonical value. */
  readonly name?: string;
  /** The canonical name stored, or empty. */
  readonly value: string;
  readonly onChange?: (value: string) => void;
  /** The first row, which empties the answer. */
  readonly noneLabel: string;
  readonly className?: string;
  readonly isRequired?: boolean;
  readonly describedBy?: string;
  readonly testId?: string;
}) {
  const listId = useId();
  const [chosen, setChosen] = useState(value);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(
    () => (isOpen ? appListMatches(kind, language, query).slice(0, SHOWN) : []),
    [isOpen, kind, language, query],
  );
  // The empty row first, so an answer can be removed.
  const rows: readonly ListOption[] = [{ value: '', label: noneLabel }, ...matches];

  function pick(next: string) {
    setChosen(next);
    onChange?.(next);
    setQuery('');
    setIsOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActive(0);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + rows.length) % rows.length);
    } else if (event.key === 'Enter' && isOpen) {
      event.preventDefault();
      const row = rows[active];
      if (row !== undefined) pick(row.value);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setQuery('');
      setIsOpen(false);
    }
  }

  const shown = isOpen ? query : chosen === '' ? '' : appListLabel(kind, language, chosen);
  return (
    <div className="relative" data-testid={testId}>
      {name === undefined ? null : <input type="hidden" name={name} value={chosen} />}
      <Input
        id={id}
        role="combobox"
        type="text"
        autoComplete="off"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen ? `${listId}-${active}` : undefined}
        aria-required={isRequired}
        aria-describedby={describedBy}
        placeholder={chosen === '' ? noneLabel : appListLabel(kind, language, chosen)}
        value={shown}
        className={className}
        onFocus={() => {
          setIsOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setQuery('');
          setIsOpen(false);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          setActive(event.target.value.trim() === '' ? 0 : 1);
        }}
        onKeyDown={onKeyDown}
        data-testid={testId === undefined ? undefined : `${testId}-input`}
      />
      {isOpen ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {rows.map((row, index) => (
            <li
              key={row.value === '' ? 'none' : row.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={row.value === chosen}
              className={cn(
                'cursor-default rounded-sm px-2 py-1.5 text-start',
                index === active && 'bg-accent text-accent-foreground',
                row.value === '' && 'text-muted-foreground',
              )}
              // Picked before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(row.value);
              }}
              onMouseEnter={() => setActive(index)}
              data-testid={testId === undefined ? undefined : `${testId}-option`}
            >
              {row.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
