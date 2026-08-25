/**
 * A generated credential with its copy button (RAPP-25), shared by the
 * account-creation panel and the password-reset panel so "how staff hand a
 * credential over" has exactly one answer.
 *
 * `select-all` means one click selects the whole value for the staff member
 * who prefers the keyboard, and the copied note is announced rather than
 * flashed.
 */

import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface CopyableCredentialProps {
  readonly label: string;
  readonly value: string;
}

export function CopyableCredential({ label, value }: CopyableCredentialProps) {
  const { t } = useTranslation('participants');
  const [hasCopied, setHasCopied] = useState(false);
  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <p className="text-start text-sm font-medium">{label}</p>
      <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <code
          data-testid="one-time-access-code"
          aria-label={label}
          className="block min-w-0 select-all whitespace-nowrap rounded-lg bg-muted px-3 py-4 text-center font-mono text-[clamp(1.25rem,7vw,2.25rem)] leading-none font-semibold tracking-[0.08em] text-foreground"
        >
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full sm:w-auto"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setHasCopied(true));
          }}
        >
          {t('copyAction')}
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {hasCopied ? t('copiedNote') : ''}
        </span>
      </div>
    </div>
  );
}
