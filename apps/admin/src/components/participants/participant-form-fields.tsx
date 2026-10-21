/**
 * The labelled inputs the participant forms share (RAPP-24, RAPP-300): the full
 * edit form and the prefill form for a woman who has not joined yet. One
 * answer to how a field is labelled, described and announced when invalid.
 */

import { AdminAuthField } from '@/components/auth/admin-auth-field';
import { cn } from '@/lib/utils';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

/** 1 to 15, matching the schema's bound. Strings, because they are option values. */
export const DEPENDENT_COUNTS = Array.from({ length: 15 }, (_unused, index) => String(index + 1));

interface TextFieldProps<Values extends FieldValues, Output> {
  readonly control: Control<Values, unknown, Output>;
  readonly name: Path<Values>;
  readonly label: string;
  readonly type?: string;
  readonly placeholder?: string;
  readonly errorMessage?: string;
  readonly formatValue?: (value: string) => string;
}

/**
 * Reuses `AdminAuthField`, which is the app's labelled input: a visible label
 * tied to the control, `aria-invalid` and `aria-describedby` wiring, and an
 * inline error slot. A second one for this screen would be a second answer to
 * how an invalid field is announced.
 */
export function TextField<Values extends FieldValues, Output>({
  control,
  name,
  label,
  type,
  placeholder,
  errorMessage,
  formatValue,
}: TextFieldProps<Values, Output>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <AdminAuthField
          id={`participant-${name}`}
          label={label}
          type={type}
          placeholder={placeholder}
          errorMessage={errorMessage}
          className="h-9"
          value={
            formatValue
              ? formatValue(typeof field.value === 'string' ? field.value : '')
              : typeof field.value === 'string'
                ? field.value
                : (field.value ?? '').toString()
          }
          onChange={(event) => field.onChange(event.target.value)}
          onBlur={field.onBlur}
          ref={field.ref}
        />
      )}
    />
  );
}

interface SelectFieldProps<Values extends FieldValues, Output> {
  readonly control: Control<Values, unknown, Output>;
  readonly name: Path<Values>;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  /** Maps the `<select>` string back to what the schema wants (boolean, number). */
  readonly toFieldValue?: (value: string) => unknown;
  readonly fromFieldValue?: (value: unknown) => string;
  readonly errorMessage?: string;
  /**
   * Adds a first, empty choice for a value nobody has given yet (RAPP-300).
   * Choosing it clears the field.
   */
  readonly emptyLabel?: string;
}

/**
 * A native `<select>`, for the reason the roster's filters are native ones: it
 * is keyboard accessible, screen-reader announced and touch-friendly on every
 * platform without a line of code, and these are exactly the plain one-of-many
 * choices it was designed for.
 */
export function SelectField<Values extends FieldValues, Output>({
  control,
  name,
  label,
  options,
  toFieldValue,
  fromFieldValue,
  errorMessage,
  emptyLabel,
}: SelectFieldProps<Values, Output>) {
  const id = `participant-${name}`;
  const errorId = `${id}-error`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-start text-sm font-medium text-foreground">
            {label}
          </label>
          <select
            id={id}
            ref={field.ref}
            aria-invalid={errorMessage !== undefined}
            aria-describedby={errorMessage === undefined ? undefined : errorId}
            value={
              field.value === undefined || field.value === null
                ? ''
                : fromFieldValue === undefined
                  ? (field.value as string)
                  : fromFieldValue(field.value)
            }
            onChange={(event) =>
              field.onChange(
                event.target.value === '' && emptyLabel !== undefined
                  ? undefined
                  : toFieldValue === undefined
                    ? event.target.value
                    : toFieldValue(event.target.value),
              )
            }
            onBlur={field.onBlur}
            className={cn(
              'h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none',
              'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
            )}
          >
            {emptyLabel === undefined ? null : <option value="">{emptyLabel}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errorMessage === undefined ? null : (
            <p id={errorId} className="text-start text-sm text-destructive">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    />
  );
}
