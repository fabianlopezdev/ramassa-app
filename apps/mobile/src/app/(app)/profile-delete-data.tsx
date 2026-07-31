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
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { submitDeletionRequest } from '@/lib/profile';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useAuth } from '@ramassa/shared/auth';

export default function DeleteDataScreen() {
  const { t } = useTranslation('profile');
  const languageFontClass = useLanguageFontClass();
  const router = useRouter();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  async function send() {
    if (user === null) return;
    setIsSubmitting(true);
    setHasFailed(false);
    try {
      await submitDeletionRequest({
        profileId: user.id,
        ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
      });
      router.back();
    } catch {
      // Staying on the screen with her words intact: a failed send must not
      // also cost her the message she just wrote.
      setHasFailed(true);
    } finally {
      setIsSubmitting(false);
    }
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
      {hasFailed ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${languageFontClass}`}
        >
          {t('saveFailed')}
        </Text>
      ) : null}

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
