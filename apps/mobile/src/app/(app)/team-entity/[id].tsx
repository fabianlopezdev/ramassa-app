/**
 * One collaborating entity on the phone (RAPP-407), as the selected entity in
 * the web admin's entities tab: its counts, Deactivate or Reactivate (asked
 * first; collaborators lose access, referral history stays), inviting a
 * collaborator (the sign-in code goes by email), and each collaborator with
 * Remove access or Restore access and Reset second factor, each asked first.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useEntityActions, useEntityCollaborators, useManagedEntities } from '@/lib/team-entities';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Notice = { readonly ok: boolean; readonly text: string } | null;

/** Asks before an action; the web build has no native alert, so it asks the browser. */
function confirmThen(
  title: string,
  body: string,
  labels: { readonly confirm: string; readonly cancel: string },
  run: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${body}`)) run();
    return;
  }
  Alert.alert(title, body, [
    { text: labels.cancel, style: 'cancel' },
    { text: labels.confirm, style: 'destructive', onPress: run },
  ]);
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const fontClass = useLanguageFontClass();
  return (
    <View
      style={continuousCorners}
      className="gap-md rounded-md border border-neutral-200 bg-white p-md"
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-xl font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function RowAction({
  testID,
  label,
  onPress,
  isDisabled,
  isDestructive = false,
}: {
  readonly testID: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly isDisabled: boolean;
  readonly isDestructive?: boolean;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isDisabled={isDisabled}
      haptic="tapLight"
      className="min-h-recommended justify-center px-xs"
    >
      <Text
        className={`font-semibold ${
          isDisabled ? 'text-neutral-400' : isDestructive ? 'text-error' : 'text-primary-dark'
        } ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

export default function TeamEntityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('entity-management');
  const { t: tAuth } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const entities = useManagedEntities();
  const collaborators = useEntityCollaborators(id);
  const { setActive, invite, setCollaboratorActive, resetFactor } = useEntityActions();
  const entity = entities.data?.find((candidate) => candidate.id === id);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const isBusy =
    setActive.isPending ||
    invite.isPending ||
    setCollaboratorActive.isPending ||
    resetFactor.isPending;
  const labels = { confirm: t('statusHeading'), cancel: t('cancel') };
  const done = (success: string) => ({
    onSuccess: () => {
      playHaptic('success');
      setNotice({ ok: true, text: success });
    },
    onError: () => {
      playHaptic('error');
      setNotice({ ok: false, text: t('actionError') });
    },
  });
  const canInvite =
    entity?.isActive === true &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    !isBusy;

  return (
    <SafeAreaView
      testID="team-entity"
      className="flex-1 bg-neutral-50"
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-3xl"
        keyboardShouldPersistTaps="handled"
      >
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="team-entity-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          {entity === undefined ? null : (
            <>
              <View className="gap-xs">
                <Text
                  accessibilityRole="header"
                  className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
                >
                  {entity.name}
                </Text>
                <Text
                  testID="entity-status"
                  className={`text-start text-md font-semibold text-neutral-700 ${fontClass}`}
                >
                  {`${t('statusHeading')}: ${entity.isActive ? t('status.active') : t('status.inactive')}`}
                </Text>
                <Text className={`text-start text-sm tabular-nums text-neutral-600 ${fontClass}`}>
                  {[
                    `${t('collaborators')}: ${entity.activeCollaboratorCount}`,
                    `${t('referrals')}: ${entity.referralCount}`,
                    `${t('pendingInvitations')}: ${entity.pendingInvitationCount}`,
                  ].join(' · ')}
                </Text>
              </View>
              <RowAction
                testID="entity-toggle-active"
                label={entity.isActive ? t('deactivateEntity') : t('reactivateEntity')}
                isDisabled={isBusy}
                isDestructive={entity.isActive}
                onPress={() => {
                  setNotice(null);
                  const toggle = () =>
                    setActive.mutate(
                      { entityId: entity.id, isActive: !entity.isActive },
                      done(entity.isActive ? t('entityDeactivated') : t('entityReactivated')),
                    );
                  if (!entity.isActive) {
                    toggle();
                    return;
                  }
                  confirmThen(
                    t('confirmDeactivateEntity'),
                    t('confirmEntityDeactivation'),
                    { ...labels, confirm: t('deactivateEntity') },
                    toggle,
                  );
                }}
              />

              {notice === null ? null : (
                <Text
                  testID="entity-notice"
                  accessibilityLiveRegion="polite"
                  className={`text-start text-md ${notice.ok ? 'text-success' : 'text-error'} ${fontClass}`}
                >
                  {notice.text}
                </Text>
              )}

              {entity.isActive ? (
                <Section title={t('inviteTitle')}>
                  <AuthTextField
                    testID="entity-invite-first-name"
                    label={t('firstName')}
                    value={firstName}
                    onChangeText={setFirstName}
                    maxLength={100}
                  />
                  <AuthTextField
                    testID="entity-invite-last-name"
                    label={t('lastName')}
                    value={lastName}
                    onChangeText={setLastName}
                    maxLength={100}
                  />
                  <AuthTextField
                    testID="entity-invite-email"
                    label={t('email')}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    maxLength={254}
                  />
                  <PressableScale
                    testID="entity-invite-submit"
                    accessibilityRole="button"
                    accessibilityLabel={t('sendInvite')}
                    onPress={() => {
                      setNotice(null);
                      invite.mutate(
                        { entityId: entity.id, person: { firstName, lastName, email } },
                        {
                          ...done(t('inviteSent')),
                          onSuccess: () => {
                            playHaptic('success');
                            setNotice({ ok: true, text: t('inviteSent') });
                            setFirstName('');
                            setLastName('');
                            setEmail('');
                          },
                        },
                      );
                    }}
                    isBusy={invite.isPending}
                    isDisabled={!canInvite}
                    haptic="tapLight"
                    style={continuousCorners}
                    className={`min-h-recommended items-center justify-center rounded-md px-lg ${
                      canInvite ? 'bg-primary' : 'bg-neutral-200'
                    }`}
                  >
                    <Text
                      className={`text-center text-md font-bold ${canInvite ? 'text-white' : 'text-neutral-500'} ${fontClass}`}
                    >
                      {invite.isPending ? t('working') : t('sendInvite')}
                    </Text>
                  </PressableScale>
                </Section>
              ) : null}

              <Section title={t('collaborators')}>
                {(collaborators.data ?? []).length === 0 ? (
                  <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
                    {t('noCollaborators')}
                  </Text>
                ) : (
                  (collaborators.data ?? []).map((collaborator) => (
                    <View
                      key={collaborator.profileId}
                      testID={`collaborator-${collaborator.profileId}`}
                      style={continuousCorners}
                      className="gap-xs rounded-md bg-neutral-50 p-md"
                    >
                      <View className="flex-row flex-wrap items-center justify-between gap-sm">
                        <Text
                          className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}
                        >
                          {`${collaborator.firstName} ${collaborator.lastName}`.trim()}
                        </Text>
                        <Text className={`text-sm font-semibold text-neutral-700 ${fontClass}`}>
                          {collaborator.acceptedAt === null
                            ? t('status.pending')
                            : collaborator.isActive
                              ? t('status.active')
                              : t('status.inactive')}
                        </Text>
                      </View>
                      <Text className="text-start text-sm text-neutral-600">
                        {collaborator.email}
                      </Text>
                      <View className="flex-row flex-wrap gap-sm">
                        <RowAction
                          testID={`collaborator-toggle-${collaborator.profileId}`}
                          label={collaborator.isActive ? t('removeAccess') : t('restoreAccess')}
                          isDisabled={isBusy}
                          isDestructive={collaborator.isActive}
                          onPress={() => {
                            setNotice(null);
                            const toggle = () =>
                              setCollaboratorActive.mutate(
                                {
                                  profileId: collaborator.profileId,
                                  isActive: !collaborator.isActive,
                                },
                                done(
                                  collaborator.isActive
                                    ? t('collaboratorAccessRemoved')
                                    : t('collaboratorAccessRestored'),
                                ),
                              );
                            if (!collaborator.isActive) {
                              toggle();
                              return;
                            }
                            confirmThen(
                              t('confirmRemoveAccess'),
                              t('confirmCollaboratorRemoval'),
                              { ...labels, confirm: t('removeAccess') },
                              toggle,
                            );
                          }}
                        />
                        {collaborator.isActive ? (
                          <RowAction
                            testID={`collaborator-reset-factor-${collaborator.profileId}`}
                            label={tAuth('secondFactorResetAction')}
                            isDisabled={isBusy}
                            onPress={() => {
                              setNotice(null);
                              confirmThen(
                                tAuth('secondFactorResetAction'),
                                tAuth('secondFactorResetConfirm'),
                                { ...labels, confirm: tAuth('secondFactorResetAction') },
                                () =>
                                  resetFactor.mutate(
                                    collaborator.profileId,
                                    done(tAuth('secondFactorResetDone')),
                                  ),
                              );
                            }}
                          />
                        ) : null}
                      </View>
                    </View>
                  ))
                )}
              </Section>
            </>
          )}
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
