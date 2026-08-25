/**
 * The password reset for an admin-created account (RAPP-25).
 *
 * Rendered ONLY when the record says `auth_method: 'admin_created'`: those are
 * the accounts that have a password at all. A magic-link account recovers
 * through her own inbox, and offering staff a reset there would be a button
 * whose only outcome is the RPC's refusal.
 *
 * The confirm step is inline rather than a browser dialog, because the thing
 * being confirmed needs saying in the reader's language: the OLD password
 * stops working the moment the new one exists. The new password then follows
 * the same one-time rules as creation — shown once, stored nowhere, gone with
 * the panel.
 */

import { CopyableCredential } from '@/components/participants/copyable-credential';
import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resetParticipantPassword } from '@ramassa/shared/accounts';

export interface ResetPasswordControlProps {
  readonly participantId: string;
}

type ResetState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'confirming' }
  | { readonly kind: 'working' }
  | { readonly kind: 'done'; readonly accessCode: string };

export function ResetPasswordControl({ participantId }: ResetPasswordControlProps) {
  const { t } = useTranslation(['participants', 'profile', 'common']);
  const [state, setState] = useState<ResetState>({ kind: 'idle' });
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  async function reset() {
    setErrorMessage(undefined);
    setState({ kind: 'working' });
    const result = await safeAsync(() => resetParticipantPassword(supabase, participantId));
    if (!result.ok) {
      setErrorMessage(t('resetAccessCodeFailed'));
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'done', accessCode: result.value });
  }

  if (state.kind === 'done') {
    return (
      <section
        aria-live="polite"
        className="flex w-full min-w-0 flex-col gap-4 rounded-md border p-4 sm:p-6"
      >
        <h2 className="text-start text-xl font-semibold">{t('resetAccessCodeDoneTitle')}</h2>
        <p className="text-start text-sm font-medium text-destructive">
          {t('credentialsShownOnce')}
        </p>
        <p className="text-start text-sm text-foreground">{t('credentialsHandoffGuidance')}</p>
        <CopyableCredential label={t('credentialsCodeLabel')} value={state.accessCode} />
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-12 w-full sm:w-fit"
          onClick={() => setState({ kind: 'idle' })}
        >
          {t('common:close')}
        </Button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <p className="text-start text-sm text-muted-foreground">{t('resetAccessCodeHint')}</p>
      {state.kind === 'confirming' ? (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <p className="text-start text-sm">{t('resetAccessCodeConfirmBody')}</p>
          <Button
            type="button"
            size="lg"
            className="h-12 w-full sm:w-auto"
            onClick={() => void reset()}
          >
            {t('resetAccessCodeConfirmAction')}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 w-full sm:w-auto"
            onClick={() => setState({ kind: 'idle' })}
          >
            {t('profile:cancelAction')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 w-full sm:w-auto"
            disabled={state.kind === 'working'}
            onClick={() => setState({ kind: 'confirming' })}
          >
            {t('resetAccessCodeAction')}
          </Button>
          {errorMessage === undefined ? null : (
            <p aria-live="polite" className="text-start text-sm text-destructive">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
