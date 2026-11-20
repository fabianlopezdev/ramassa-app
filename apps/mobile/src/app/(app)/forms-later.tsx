/**
 * Per a més tard (RAPP-833): the optional forms she put off with "Ara no" on
 * Inici. Each row opens its form, so she can still answer it, and has
 * "Esborra", which closes it for good after a warning. Opened from the quiet
 * line at the end of the forms section on Inici (RAPP-865), which shows only
 * while a form waits here; when the last one leaves, the screen closes.
 */

import { PendingFormPrompt } from '@/components/forms/pending-form-prompt';
import { ProfileScreenFrame } from '@/components/profile/profile-screen-frame';
import { useMyCustomFormsByPlace } from '@/lib/custom-forms';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function FormsLaterScreen() {
  const { t } = useTranslation('home');
  const { back, canGoBack } = useRouter();
  const { waiting, later } = useMyCustomFormsByPlace();
  const isEmpty = waiting !== undefined && later.length === 0;
  useEffect(() => {
    if (isEmpty && canGoBack()) back();
  }, [back, canGoBack, isEmpty]);

  return (
    <ProfileScreenFrame title={t('later.title')} testID="forms-later">
      {later.map((form) => (
        <PendingFormPrompt key={form.responseId} form={form} place="later" />
      ))}
    </ProfileScreenFrame>
  );
}
