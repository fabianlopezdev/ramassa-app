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
    <div className="flex flex-col gap-1.5">
      <p className="text-start text-sm font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="select-all rounded-md bg-muted px-3 py-2 font-mono text-base">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
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
