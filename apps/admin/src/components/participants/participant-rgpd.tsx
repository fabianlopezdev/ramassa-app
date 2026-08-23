/**
 * The two irreversible RGPD gestures on a participant's record (RAPP-26):
 * anonymize, and erase.
 *
 * Deactivation is NOT here. It lives in the header next to her status badge,
 * where it always has, because it is reversible and ordinary and does not belong
 * behind the same door as the two acts that cannot be undone. Keeping the three
 * together would make the safe option feel as dangerous as the terminal one, and
 * the predictable result of that is a team that deactivates nobody.
 *
 * Erasure is rendered ONLY for an admin, matching what Postgres will enforce
 * anyway (ADR-023). The guard here is not the boundary, it is the courtesy: a
 * button whose only possible outcome is a refusal is a worse thing to show a
 * staff member than no button at all.
 */

import { DestructiveConfirm } from '@/components/participants/destructive-confirm';
import { Button } from '@/components/ui/button';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import { getErrorMessageKey } from '@ramassa/shared/errors';
import type { ParticipantDetailRow } from '@ramassa/shared/participants';
import {
  anonymizeParticipant,
  deleteParticipantPermanently,
  eraseParticipant,
} from '@ramassa/shared/rgpd';
import { purgeParticipantMedia } from '@ramassa/shared/upload-client';

export interface ParticipantRgpdProps {
  readonly participant: ParticipantDetailRow;
  /** Her outstanding erasure request, when she has raised one (RAPP-22). */
  readonly openDeletionRequestReason?: string | null;
}

type Gesture = 'none' | 'anonymize' | 'erase';

export function ParticipantRgpd({ participant, openDeletionRequestReason }: ParticipantRgpdProps) {
  const { t } = useTranslation(['participants', 'errors', 'common']);
  const router = useRouter();
  const navigate = useNavigate();
  const { role } = useAuth();

  const [gesture, setGesture] = useState<Gesture>('none');
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const anonymizeTriggerRef = useRef<HTMLButtonElement>(null);
  const eraseTriggerRef = useRef<HTMLButtonElement>(null);
  const focusAfterCloseRef = useRef<Exclude<Gesture, 'none'> | null>(null);

  const isAnonymized = participant.anonymized_at !== null;
  const canErase = role === 'admin';

  function close() {
    setGesture('none');
    setErrorMessage(undefined);
  }

  function open(nextGesture: Exclude<Gesture, 'none'>) {
    focusAfterCloseRef.current = nextGesture;
    setGesture(nextGesture);
  }

  useEffect(() => {
    if (gesture !== 'none' || focusAfterCloseRef.current === null) return;
    const trigger =
      focusAfterCloseRef.current === 'anonymize' ? anonymizeTriggerRef : eraseTriggerRef;
    focusAfterCloseRef.current = null;
    const frame = requestAnimationFrame(() => trigger.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [gesture]);

  async function anonymize() {
    setErrorMessage(undefined);
    setIsWorking(true);
    const result = await safeAsync(() => anonymizeParticipant(supabase, participant.id));
    setIsWorking(false);
    if (!result.ok) {
      setErrorMessage(t(getErrorMessageKey(result.error.code)));
      return;
    }
    close();
    await router.invalidate();
  }

  /**
   * Both halves, in the order ADR-023 fixes: her stored objects first, then her
   * record. The access token is read at the moment of the call rather than held,
   * so a session refreshed while the dialog was open is still the one used.
   */
  async function erase() {
    setErrorMessage(undefined);
    setIsWorking(true);

    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (accessToken === undefined) {
      setIsWorking(false);
      setErrorMessage(t('errors:AUTH-2'));
      return;
    }

    const result = await eraseParticipant(participant.id, {
      purgeMedia: () =>
        purgeParticipantMedia({
          mediaWorkerUrl,
          accessToken,
          participantId: participant.id,
        }),
      deleteRecord: () => deleteParticipantPermanently(supabase, participant.id),
    });
    setIsWorking(false);

    if (!result.ok) {
      setErrorMessage(t(getErrorMessageKey(result.error.code)));
      return;
    }

    // Away from a route whose loader would now find nothing, and REPLACE rather
    // than push: the back button must not lead to a record that no longer
    // exists and a "not found" screen for a woman who was just erased on
    // purpose.
    await navigate({ to: '/participants', replace: true });
  }

  if (gesture === 'anonymize') {
    return (
      <DestructiveConfirm
        title={t('anonymizeConfirmTitle', {
          name: `${participant.first_name} ${participant.last_name}`.trim(),
        })}
        body={t('anonymizeConfirmBody')}
        consequences={[
          t('anonymizeConsequenceRemoved'),
          t('anonymizeConsequenceKept'),
          t('anonymizeConsequenceNotes'),
          t('anonymizeConsequenceConsent'),
        ]}
        confirmationPhrase={t('anonymizeConfirmPhrase')}
        confirmLabel={t('anonymizeAction')}
        isWorking={isWorking}
        errorMessage={errorMessage}
        onConfirm={() => void anonymize()}
        onCancel={close}
      />
    );
  }

  if (gesture === 'erase') {
    return (
      <DestructiveConfirm
        title={t('eraseConfirmTitle', {
          name: `${participant.first_name} ${participant.last_name}`.trim(),
        })}
        body={t('eraseConfirmBody')}
        consequences={[
          t('eraseConsequenceRecord'),
          t('eraseConsequenceMedia'),
          t('eraseConsequenceAccess'),
          t('eraseConsequenceAudit'),
        ]}
        confirmationPhrase={t('eraseConfirmPhrase')}
        confirmLabel={t('eraseAction')}
        isWorking={isWorking}
        errorMessage={errorMessage}
        onConfirm={() => void erase()}
        onCancel={close}
      >
        {openDeletionRequestReason === undefined ? null : (
          <div className="flex flex-col gap-1 rounded-md bg-muted p-4">
            <p className="text-start text-sm font-medium">{t('eraseFulfillsRequest')}</p>
            {openDeletionRequestReason === null ? null : (
              // Her own words, shown to the person about to act on them. A
              // request that says "take me off the photos" is not a request to
              // be erased, and this is the last moment anyone can notice.
              <p className="text-start text-sm italic text-muted-foreground">
                {openDeletionRequestReason}
              </p>
            )}
          </div>
        )}
      </DestructiveConfirm>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <h2 className="text-start text-lg font-semibold">{t('rgpdSectionTitle')}</h2>
      <p className="text-start text-sm text-muted-foreground">{t('rgpdSectionHint')}</p>

      {openDeletionRequestReason === undefined ? null : (
        <p className="text-start text-sm font-medium">{t('rgpdOpenRequest')}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {isAnonymized ? (
          <p className="text-start text-sm text-muted-foreground">{t('alreadyAnonymized')}</p>
        ) : (
          <Button
            ref={anonymizeTriggerRef}
            type="button"
            size="lg"
            variant="outline"
            onClick={() => open('anonymize')}
          >
            {t('anonymizeAction')}
          </Button>
        )}

        {canErase ? (
          <Button
            ref={eraseTriggerRef}
            type="button"
            size="lg"
            variant="destructive"
            onClick={() => open('erase')}
          >
            {t('eraseAction')}
          </Button>
        ) : (
          // Said rather than left as a missing button: a staff member who cannot
          // find the control should learn that it exists and who has it, not
          // conclude the feature is broken.
          <p className="text-start text-sm text-muted-foreground">{t('eraseAdminOnly')}</p>
        )}
      </div>
    </section>
  );
}
