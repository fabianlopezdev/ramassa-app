/**
 * A labelled input for the admin auth screens (RAPP-13): a visible `<label>`
 * tied to the input, `aria-invalid` + `aria-describedby` wiring for screen
 * readers, and an inline error slot. Logical `text-start` alignment keeps it
 * correct in RTL. Works with react-hook-form's `register` (spread `...field`).
 */

import { Input } from '@/components/ui/input';
import { forwardRef, type ComponentProps } from 'react';

export interface AdminAuthFieldProps extends ComponentProps<'input'> {
  readonly id: string;
  readonly label: string;
  readonly errorMessage?: string;
}

export const AdminAuthField = forwardRef<HTMLInputElement, AdminAuthFieldProps>(
  function AdminAuthField({ id, label, errorMessage, ...inputProps }, ref) {
    const hasError = Boolean(errorMessage);
    const errorId = `${id}-error`;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-start text-sm font-medium text-foreground">
          {label}
        </label>
        <Input
          id={id}
          ref={ref}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          className="h-11"
          {...inputProps}
        />
        {hasError ? (
          <p id={errorId} className="text-start text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </div>
    );
  },
);
