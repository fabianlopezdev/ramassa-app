/**
 * A new participant invite from the phone (RAPP-284), with the web admin's
 * rules: her email (the same login schema), and an optional referring entity
 * that her guided registration shows pre-filled. The entity is a picker of the
 * entities the organization already uses, with "Other" for a new one, so the
 * same entity is not typed in three spellings.
 *
 * The invite sends no email. The sheet says what to tell her, then shows the
 * result: what she does next and until when the invite is open.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import type { useParticipantInvites } from '@/lib/participant-invites';
import { useParticipantFilterOptions } from '@/lib/participant-lookup';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  INVITE_ALREADY_HAS_ACCOUNT,
  type CreatedParticipantInvite,
} from '@ramassa/shared/accounts';
import { isAppError } from '@ramassa/shared/errors';
import { MADRID_TIME_ZONE } from '@ramassa/shared/events';
import { DEFAULT_LANGUAGE } from '@ramassa/shared/i18n';
import { createParticipantInviteSchema } from '@ramassa/shared/schemas';

const NONE = '__none__';
const OTHER = '__other__';

function SheetButton({
  testID,
  label,
  onPress,
  isPrimary = false,
  isBusy = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isPrimary?: boolean;
  readonly isBusy?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isBusy={isBusy}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended items-center justify-center rounded-md px-lg ${
        isPrimary ? 'bg-primary' : 'border border-neutral-300 bg-white'
      }`}
    >
      <Text
        className={`text-center text-md font-bold ${isPrimary ? 'text-white' : 'text-primary-dark'} ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export function InviteSheet({
  visible,
  onClose,
  create,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly create: ReturnType<typeof useParticipantInvites>['create'];
}) {
  const { t, i18n } = useTranslation('participants');
  const fontClass = useLanguageFontClass();
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  const entities = useParticipantFilterOptions().data?.entities ?? [];
  const [email, setEmail] = useState('');
  const [entity, setEntity] = useState<string>(NONE);
  const [otherEntity, setOtherEntity] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedParticipantInvite | null>(null);
  const formatDate = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
      dateStyle: 'long',
      timeZone: MADRID_TIME_ZONE,
    });
    return (value: string) => format.format(new Date(value));
  }, [i18n.resolvedLanguage]);

  const reset = () => {
    setEmail('');
    setEntity(NONE);
    setOtherEntity('');
    setEmailError(null);
    setCreated(null);
    create.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = () => {
    const referenceEntity = entity === NONE ? undefined : entity === OTHER ? otherEntity : entity;
    const parsed = createParticipantInviteSchema.safeParse({ email, referenceEntity });
    if (!parsed.success) {
      setEmailError(t('inviteEmailError'));
      playHaptic('warning');
      return;
    }
    setEmailError(null);
    create.mutate(parsed.data, {
      onSuccess: (invite) => {
        playHaptic('success');
        setCreated(invite);
      },
    });
  };
  const hasAccount =
    create.isError &&
    isAppError(create.error) &&
    create.error.context.reason === INVITE_ALREADY_HAS_ACCOUNT;

  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView className="flex-1 bg-white" testID="invite-sheet">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerClassName="gap-md p-lg" keyboardShouldPersistTaps="handled">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
            >
              {created === null ? t('newTitle') : t('invitedTitle')}
            </Text>
            {created === null ? (
              <>
                <Text className={`text-start text-md text-neutral-700 ${fontClass}`}>
                  {t('inviteIntro')}
                </Text>
                <AuthTextField
                  testID="invite-email"
                  label={t('invites.emailLabel')}
                  value={email}
                  onChangeText={setEmail}
                  errorMessage={emailError ?? undefined}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                />
                <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                  {t('inviteNoEmailHint')}
                </Text>
                <View className="gap-xs">
                  <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
                    {t('entityOptionalLabel')}
                  </Text>
                  <View className="flex-row flex-wrap gap-sm">
                    {[NONE, ...entities, OTHER].map((candidate) => (
                      <ChoiceOption
                        key={candidate}
                        testID={`invite-entity-${candidate}`}
                        value={candidate}
                        label={
                          candidate === NONE
                            ? t('invites.entityNone')
                            : candidate === OTHER
                              ? t('invites.entityOther')
                              : candidate
                        }
                        selected={candidate === entity}
                        onSelect={setEntity}
                        languageFontClass={fontClass}
                      />
                    ))}
                  </View>
                  {entity === OTHER ? (
                    <AuthTextField
                      testID="invite-entity-other-name"
                      label={t('invites.entityOtherLabel')}
                      value={otherEntity}
                      onChangeText={setOtherEntity}
                    />
                  ) : null}
                  <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                    {t('entityPrefillHint')}
                  </Text>
                </View>
                {create.isError ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    className={`text-start text-sm text-error ${fontClass}`}
                  >
                    {hasAccount ? t('inviteAlreadyHasAccount') : t('inviteFailed')}
                  </Text>
                ) : null}
                <View className="flex-row flex-wrap gap-sm">
                  <SheetButton
                    testID="invite-create"
                    label={t('inviteAction')}
                    onPress={submit}
                    isBusy={create.isPending}
                    isPrimary
                  />
                  <SheetButton
                    testID="invite-close"
                    label={t('profile:cancelAction')}
                    onPress={close}
                  />
                </View>
              </>
            ) : (
              <>
                <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
                  {t('invitedBody', { email: created.email })}
                </Text>
                <Text className={`text-start text-md text-neutral-800 ${fontClass}`}>
                  {t('invitedExpires', { date: formatDate(created.expires_at) })}
                </Text>
                <View className="flex-row flex-wrap gap-sm">
                  <SheetButton
                    testID="invite-another"
                    label={t('inviteAnotherAction')}
                    onPress={reset}
                  />
                  <SheetButton
                    testID="invite-done"
                    label={t('material.done')}
                    onPress={close}
                    isPrimary
                  />
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
