/**
 * Asking Ramassà to erase your data (RGPD art. 17, RAPP-22).
 *
 * This files a REQUEST; it does not delete anything, and the screen says so
 * plainly. A participant's record is entangled with attendance history and the
 * organization's safeguarding obligations, so a human has to answer: promising
 * instant erasure would be a lie told at the most sensitive moment in the
 * product.
 *
 * The reason box is optional. Having to justify yourself before exercising a
 * right is a way of discouraging people from exercising it.
 */

import { AuthTextField } from '@/components/auth/auth-text-field';
import { FailureNotice } from '@/components/error-code-line';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { playHaptic } from '@/lib/haptics/haptics';
import { submitDeletionRequest } from '@/lib/profile';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';

export default function DeleteDataScreen() {
  const { t } = useTranslation('profile');
  const router = useRouter();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The failure's own code, not a boolean: it drives the shake and picks the
  // haptic through the RAPP-12 taxonomy.
  const [failureCode, setFailureCode] = useState<AppErrorCode | null>(null);

  async function send() {
    if (user === null) return;
    setIsSubmitting(true);
    setFailureCode(null);
    // A `Result`, not a try/catch (contract rule 7): the wired `safeAsync`
    // inside the action has already logged and reported the failure by the time
    // it arrives here, and it cannot reject, so there is no path out of this
    // function that leaves `isSubmitting` stuck true.
    const result = await submitDeletionRequest({
      profileId: user.id,
      ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
    });
    setIsSubmitting(false);
    if (!result.ok) {
      // Staying on the screen with her words intact: a failed send must not
      // also cost her the message she just wrote.
      setFailureCode(result.error.code);
      return;
    }
    // The request reached Ramassà. A completed primary action, so it gets the
    // success feedback every other one gets (RAPP-70) before the screen goes.
    playHaptic('success');
    router.back();
  }

  return (
    <WizardFrame
      title={t('deleteTitle')}
      intro={t('deleteIntro')}
      continueLabel={t('deleteAction')}
      onContinue={() => void send()}
      isContinueBusy={isSubmitting}
      onBack={() => router.back()}
    >
      {/* Mounted only while there IS a failure, so the shake wrapper never
          occupies a slot in the frame's gap when everything is fine.

          The short code travels with the friendly message (contract rule 7):
          this is the most sensitive request in the product, and "it did not
          work" with nothing to report is where a woman gives up. */}
      {failureCode === null ? null : <FailureNotice code={failureCode} message={t('saveFailed')} />}

      <AuthTextField
        label={t('deleteReasonLabel')}
        placeholder={t('deleteReasonPlaceholder')}
        value={reason}
        onChangeText={setReason}
        multiline
      />
    </WizardFrame>
  );
}
