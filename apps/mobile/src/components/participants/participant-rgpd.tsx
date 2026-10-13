/**
 * Her personal data on the participant card (RAPP-286): her own erasure
 * request when she has raised one, and the two GDPR actions of the web admin.
 * Anonymize needs `rgpd.erase`; erase everything also needs `team.manage`, as
 * the database does. Last on the card, so nobody reaches them by scrolling
 * past something else.
 *
 * Each action opens a sheet that lists what it does, asks for its action word
 * to be typed, and runs behind the step-up check. A cancelled step-up
 * changes nothing and says nothing.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useParticipantDeletionRequest, useParticipantRgpdActions } from '@/lib/rgpd';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessageKey, isAppError, toAppError } from '@ramassa/shared/errors';
import type { ParticipantDetailRow } from '@ramassa/shared/participants';

type Gesture = 'anonymize' | 'erase';

function DestructiveSheet({
  gesture,
  participant,
  requestReason,
  onClose,
  onDone,
}: {
  readonly gesture: Gesture | null;
  readonly participant: ParticipantDetailRow;
  readonly requestReason: string | null | undefined;
  readonly onClose: () => void;
  readonly onDone: (gesture: Gesture) => void;
}) {
  const { t } = useTranslation(['participants', 'errors']);
  const fontClass = useLanguageFontClass();
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  const { anonymize, erase } = useParticipantRgpdActions(participant.id);
  const [typed, setTyped] = useState('');
  const name = `${participant.first_name} ${participant.last_name}`.trim();
  const isErase = gesture === 'erase';
  const mutation = isErase ? erase : anonymize;
  const phrase = t(isErase ? 'eraseConfirmPhrase' : 'anonymizeConfirmPhrase');
  const consequences = isErase
    ? [
        t('eraseConsequenceRecord'),
        t('eraseConsequenceMedia'),
        t('eraseConsequenceAccess'),
        t('eraseConsequenceAudit'),
      ]
    : [
        t('anonymizeConsequenceRemoved'),
        t('anonymizeConsequenceKept'),
        t('anonymizeConsequenceNotes'),
        t('anonymizeConsequenceConsent'),
      ];
  const isTyped = typed.trim().toUpperCase() === phrase.toUpperCase();
  // A step-up she cancelled is not a failure to report.
  const failure =
    mutation.isError && !(isAppError(mutation.error) && mutation.error.code === 'AUTH-9')
      ? toAppError(mutation.error).code
      : null;

  const close = () => {
    setTyped('');
    anonymize.reset();
    erase.reset();
    onClose();
  };
  const confirm = () => {
    if (!isTyped || gesture === null) return;
    mutation.mutate(undefined, {
      onSuccess: () => {
        playHaptic('success');
        setTyped('');
        onDone(gesture);
      },
    });
  };

  return (
    <Modal
      visible={gesture !== null && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (!mutation.isPending) close();
      }}
    >
      <SafeAreaView className="flex-1 bg-white" testID="rgpd-sheet">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerClassName="gap-md p-lg"
            keyboardShouldPersistTaps="handled"
            // The page sheet does not move with the keyboard, so the scroll view does.
            automaticallyAdjustKeyboardInsets
          >
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t(isErase ? 'eraseConfirmTitle' : 'anonymizeConfirmTitle', { name })}
            </Text>
            <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
              {t(isErase ? 'eraseConfirmBody' : 'anonymizeConfirmBody')}
            </Text>
            <View className="gap-xs">
              {consequences.map((line) => (
                <Text key={line} className={`text-start text-md text-neutral-800 ${fontClass}`}>
                  {`• ${line}`}
                </Text>
              ))}
            </View>
            {isErase && requestReason !== undefined ? (
              <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
                {`${t('eraseFulfillsRequest')} ${
                  requestReason === null || requestReason.trim() === ''
                    ? t('deletionRequestNoReason')
                    : requestReason
                }`}
              </Text>
            ) : null}
            <Text className={`text-start text-md font-semibold text-error ${fontClass}`}>
              {t('irreversibleWarning')}
            </Text>
            <AuthTextField
              testID="rgpd-confirm-phrase"
              label={`${t('confirmTypeLabel')} ${phrase}`}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {failure === null ? null : (
              <FailureNotice code={failure} message={t(getErrorMessageKey(failure))} />
            )}
            <View className="flex-row flex-wrap gap-sm">
              <PressableScale
                testID="rgpd-confirm"
                accessibilityRole="button"
                accessibilityLabel={t(isErase ? 'eraseAction' : 'anonymizeAction')}
                onPress={confirm}
                isBusy={mutation.isPending}
                isDisabled={!isTyped}
                haptic="tapLight"
                style={continuousCorners}
                className={`min-h-recommended items-center justify-center rounded-md px-lg ${
                  isTyped ? 'bg-error' : 'bg-neutral-300'
                }`}
              >
                <Text
                  className={`text-center text-md font-bold ${
                    isTyped ? 'text-white' : 'text-neutral-700'
                  } ${fontClass}`}
                >
                  {mutation.isPending
                    ? t('workingLabel')
                    : t(isErase ? 'eraseAction' : 'anonymizeAction')}
                </Text>
              </PressableScale>
              <PressableScale
                testID="rgpd-cancel"
                accessibilityRole="button"
                accessibilityLabel={t('profile:cancelAction')}
                onPress={close}
                haptic="tapLight"
                style={continuousCorners}
                className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
              >
                <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                  {t('profile:cancelAction')}
                </Text>
              </PressableScale>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function ParticipantRgpd({
  participant,
  onErased,
}: {
  readonly participant: ParticipantDetailRow;
  /** Called after her record is erased, so the screen can leave it. */
  readonly onErased: () => void;
}) {
  const { t } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  const { permissions } = useAccountAccess();
  const request = useParticipantDeletionRequest(participant.id);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const canErase = permissions.has('rgpd.erase') && permissions.has('team.manage');
  const isAnonymized = participant.anonymized_at !== null;
  const reason =
    request.data === null || request.data === undefined ? undefined : request.data.reason;

  return (
    <View className="gap-sm" testID="participant-rgpd">
      <Text
        accessibilityRole="header"
        className={`text-start text-lg font-bold text-neutral-900 ${fontClass}`}
      >
        {t('rgpdSectionTitle')}
      </Text>
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
        {t('rgpdSectionHint')}
      </Text>
      {reason === undefined ? null : (
        <View
          testID="rgpd-open-request"
          style={continuousCorners}
          className="gap-xs rounded-md border border-error bg-white p-md"
        >
          <Text className={`text-start text-md font-semibold text-neutral-900 ${fontClass}`}>
            {t('rgpdOpenRequest')}
          </Text>
          <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
            {reason === null || reason.trim() === '' ? t('deletionRequestNoReason') : reason}
          </Text>
        </View>
      )}
      {isAnonymized ? (
        <Text className={`text-start text-sm text-neutral-700 ${fontClass}`}>
          {t('alreadyAnonymized')}
        </Text>
      ) : (
        <PressableScale
          testID="rgpd-anonymize"
          accessibilityRole="button"
          accessibilityLabel={t('anonymizeAction')}
          onPress={() => setGesture('anonymize')}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center self-start rounded-md border border-error bg-white px-lg"
        >
          <Text className={`text-center text-md font-bold text-error ${fontClass}`}>
            {t('anonymizeAction')}
          </Text>
        </PressableScale>
      )}
      {canErase ? (
        <PressableScale
          testID="rgpd-erase"
          accessibilityRole="button"
          accessibilityLabel={t('eraseAction')}
          onPress={() => setGesture('erase')}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center self-start rounded-md bg-error px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {t('eraseAction')}
          </Text>
        </PressableScale>
      ) : (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('eraseAdminOnly')}
        </Text>
      )}
      <DestructiveSheet
        gesture={gesture}
        participant={participant}
        requestReason={reason}
        onClose={() => setGesture(null)}
        onDone={(done) => {
          setGesture(null);
          if (done === 'erase') onErased();
        }}
      />
    </View>
  );
}
