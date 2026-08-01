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
  | { readonly kind: 'done'; readonly password: string };

export function ResetPasswordControl({ participantId }: ResetPasswordControlProps) {
  const { t } = useTranslation(['participants', 'profile', 'common']);
  const [state, setState] = useState<ResetState>({ kind: 'idle' });
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  async function reset() {
    setErrorMessage(undefined);
    setState({ kind: 'working' });
    const result = await safeAsync(() => resetParticipantPassword(supabase, participantId));
    if (!result.ok) {
      setErrorMessage(t('resetPasswordFailed'));
      setState({ kind: 'idle' });
      return;
    }
    setState({ kind: 'done', password: result.value });
  }

  if (state.kind === 'done') {
    return (
      <section aria-live="polite" className="flex flex-col gap-4 rounded-md border p-6">
        <h2 className="text-start text-xl font-semibold">{t('resetPasswordDoneTitle')}</h2>
        <p className="text-start text-sm font-medium text-destructive">
          {t('credentialsShownOnce')}
        </p>
        <CopyableCredential label={t('credentialsPasswordLabel')} value={state.password} />
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="w-fit"
          onClick={() => setState({ kind: 'idle' })}
        >
          {t('common:close')}
        </Button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <p className="text-start text-sm text-muted-foreground">{t('resetPasswordHint')}</p>
      {state.kind === 'confirming' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-start text-sm">{t('resetPasswordConfirmBody')}</p>
          <Button type="button" size="lg" onClick={() => void reset()}>
            {t('resetPasswordConfirmAction')}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => setState({ kind: 'idle' })}
          >
            {t('profile:cancelAction')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={state.kind === 'working'}
            onClick={() => setState({ kind: 'confirming' })}
          >
            {t('resetPasswordAction')}
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
