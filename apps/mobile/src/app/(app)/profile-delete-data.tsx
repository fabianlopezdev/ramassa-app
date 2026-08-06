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
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { submitDeletionRequest } from '@/lib/profile';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { tokens } from '@ramassa/shared/tokens';

const enabledAccessibilityState = { busy: false, disabled: false } as const;
const busyAccessibilityState = { busy: true, disabled: true } as const;

interface DeletionConfirmationProps {
  readonly isBusy: boolean;
  readonly isVisible: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly t: TFunction<'profile'>;
}

function DeletionConfirmation({
  isBusy,
  isVisible,
  onCancel,
  onConfirm,
  t,
}: DeletionConfirmationProps) {
  const languageFontClass = useLanguageFontClass();

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible={isVisible}
      onRequestClose={onCancel}
    >
      <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="grow justify-center gap-xl p-lg sm:self-center sm:w-full sm:max-w-form"
        >
          <View className="gap-sm">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('deleteConfirmTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('deleteConfirmBody')}
            </Text>
          </View>

          <View className="gap-sm">
            {/* A native Modal owns a separate Android root outside the app's
                gesture root. Native pressables keep both actions interactive
                without nesting another GestureHandlerRootView. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('deleteConfirmAction')}
              accessibilityState={isBusy ? busyAccessibilityState : enabledAccessibilityState}
              disabled={isBusy}
              onPress={() => {
                playHaptic('tapLight');
                onConfirm();
              }}
              testID="profile-delete-confirm"
              style={continuousCorners}
              className={`min-h-recommended items-center justify-center rounded-md bg-error px-lg active:opacity-90 ${
                isBusy ? 'opacity-60' : ''
              }`}
            >
              <View className="flex-row items-center justify-center gap-sm">
                {isBusy ? <ActivityIndicator color={tokens.colors.white} /> : null}
                <Text className={`text-lg font-bold text-white ${languageFontClass}`}>
                  {t('deleteConfirmAction')}
                </Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('deleteConfirmCancel')}
              accessibilityState={isBusy ? busyAccessibilityState : enabledAccessibilityState}
              disabled={isBusy}
              onPress={() => {
                playHaptic('selection');
                onCancel();
              }}
              testID="profile-delete-confirm-cancel"
              style={continuousCorners}
              className={`min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg active:opacity-70 ${
                isBusy ? 'opacity-60' : ''
              }`}
            >
              <Text className={`text-md font-medium text-neutral-800 ${languageFontClass}`}>
                {t('deleteConfirmCancel')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function DeleteDataScreen() {
  const { t } = useTranslation('profile');
  const router = useRouter();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
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
      setIsConfirmationVisible(false);
      setFailureCode(result.error.code);
      return;
    }
    // The request reached Ramassà. A completed action gets the same success
    // feedback as the rest of the app (RAPP-70) before the screen goes.
    playHaptic('success');
    router.back();
  }

  function closeConfirmation() {
    if (!isSubmitting) {
      setIsConfirmationVisible(false);
    }
  }

  return (
    <>
      <WizardFrame
        title={t('deleteTitle')}
        intro={t('deleteIntro')}
        continueLabel={t('deleteAction')}
        onContinue={() => setIsConfirmationVisible(true)}
        onBack={() => router.back()}
      >
        {/* Mounted only while there IS a failure, so the shake wrapper never
          occupies a slot in the frame's gap when everything is fine.

          The short code travels with the friendly message (contract rule 7):
          this is the most sensitive request in the product, and "it did not
          work" with nothing to report is where a woman gives up. */}
        {failureCode === null ? null : (
          <FailureNotice code={failureCode} message={t('saveFailed')} />
        )}

        <AuthTextField
          label={t('deleteReasonLabel')}
          placeholder={t('deleteReasonPlaceholder')}
          value={reason}
          onChangeText={setReason}
          multiline
        />
      </WizardFrame>

      <DeletionConfirmation
        isBusy={isSubmitting}
        isVisible={isConfirmationVisible}
        onCancel={closeConfirmation}
        onConfirm={() => void send()}
        t={t}
      />
    </>
  );
}
