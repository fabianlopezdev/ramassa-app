/**
 * The team on the phone (RAPP-404), for `team.manage` holders, as the web
 * admin's Team tab: invite a person with a preset, then each person with
 * their access summary and whether they are active, and for an active person
 * Sign out everywhere, Reset second factor (never one's own) and Remove
 * access. Each action asks first; the database explains a refusal, such as
 * removing the last team manager. Edit access opens a person's switches, and
 * the presets are listed below with New, Edit, Restore default and Delete
 * (RAPP-405). A saved preset that people use asks whom to apply it to.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ApplyPresetSheet, MemberAccessSheet, PresetSheet } from '@/components/team/access-sheets';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useStaffActions, useTeamStaff } from '@/lib/team-staff';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@ramassa/shared/auth';
import {
  membersUsingPreset,
  summarizeAccess,
  teamAccessErrorKey,
  type PermissionCode,
  type PermissionPreset,
  type TeamMemberAccess,
} from '@ramassa/shared/permissions';

type Notice = { readonly ok: boolean; readonly text: string } | null;

function Section({
  title,
  intro,
  children,
}: {
  readonly title: string;
  readonly intro?: string;
  readonly children: ReactNode;
}) {
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
      {intro === undefined ? null : (
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>{intro}</Text>
      )}
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

export default function TeamStaffScreen() {
  const { t } = useTranslation('settings');
  const { t: tAuth } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { user } = useAuth();
  const { members, access } = useTeamStaff();
  const {
    invite,
    remove,
    resetFactor,
    signOutAll,
    saveAccess,
    savePreset,
    applyPreset,
    deletePreset,
    restorePreset,
  } = useStaffActions();
  const { permissions: myPermissions } = useAuth();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [presetSheet, setPresetSheet] = useState<{
    readonly preset: PermissionPreset | null;
  } | null>(null);
  const [applyPresetId, setApplyPresetId] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const presets = access.data?.presets ?? [];
  const defaultPreset = presets.find((preset) => preset.builtinKey === 'staff') ?? presets[0];
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const chosenPreset = presets.find((preset) => preset.id === (presetId ?? defaultPreset?.id));
  const isBusy =
    invite.isPending ||
    remove.isPending ||
    resetFactor.isPending ||
    signOutAll.isPending ||
    saveAccess.isPending ||
    savePreset.isPending ||
    applyPreset.isPending ||
    deletePreset.isPending ||
    restorePreset.isPending;
  const holds = (code: PermissionCode) => myPermissions.has(code);
  const teamMembers = members.data ?? [];
  const editingMember = teamMembers.find((member) => member.profile_id === editingMemberId);
  const applyingPreset = presets.find((preset) => preset.id === applyPresetId) ?? null;
  const sheetDone = (success: string, close: () => void) => ({
    onSuccess: () => {
      playHaptic('success');
      setSheetError(null);
      setNotice({ ok: true, text: success });
      close();
    },
    onError: (error: unknown) => {
      playHaptic('error');
      setSheetError(t(teamAccessErrorKey(error)));
    },
  });

  const presetName = (preset: PermissionPreset) =>
    preset.name ?? t(`team.preset.${preset.builtinKey ?? 'custom'}`);
  const accessOf = (profileId: string): TeamMemberAccess =>
    access.data?.members.find((entry) => entry.profileId === profileId) ?? {
      profileId,
      presetId: null,
      permissions: new Set(),
    };
  const summaryText = (profileId: string) => {
    const summary = summarizeAccess(accessOf(profileId), presets);
    if (summary.kind === 'custom') return t('team.custom');
    return summary.adjusted
      ? t('team.adjusted', { preset: presetName(summary.preset) })
      : presetName(summary.preset);
  };
  const done = (success: string) => ({
    onSuccess: () => {
      playHaptic('success');
      setNotice({ ok: true, text: success });
    },
    onError: (error: unknown) => {
      playHaptic('error');
      setNotice({ ok: false, text: t(teamAccessErrorKey(error)) });
    },
  });
  const labels = { confirm: t('confirm'), cancel: t('cancel') };

  const sendInvite = () => {
    setNotice(null);
    invite.mutate(
      { firstName, lastName, email, preset: chosenPreset },
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
  };
  const canInvite =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    chosenPreset !== undefined &&
    !isBusy;

  return (
    <SafeAreaView
      testID="team-staff"
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
            testID="team-staff-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('team.title')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('team.intro')}
            </Text>
          </View>

          {notice === null ? null : (
            <Text
              testID="staff-notice"
              accessibilityLiveRegion="polite"
              className={`text-start text-md ${notice.ok ? 'text-success' : 'text-error'} ${fontClass}`}
            >
              {notice.text}
            </Text>
          )}

          <Section title={t('invite')}>
            <AuthTextField
              testID="staff-invite-first-name"
              label={t('firstName')}
              value={firstName}
              onChangeText={setFirstName}
              maxLength={100}
            />
            <AuthTextField
              testID="staff-invite-last-name"
              label={t('lastName')}
              value={lastName}
              onChangeText={setLastName}
              maxLength={100}
            />
            <AuthTextField
              testID="staff-invite-email"
              label={t('email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              maxLength={254}
            />
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('team.presetLabel')}
            </Text>
            <View className="flex-row flex-wrap gap-sm">
              {presets.map((preset) => (
                <ChoiceOption
                  key={preset.id}
                  testID={`staff-invite-preset-${preset.builtinKey ?? preset.id}`}
                  value={preset.id}
                  label={presetName(preset)}
                  selected={preset.id === chosenPreset?.id}
                  onSelect={setPresetId}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
            <PressableScale
              testID="staff-invite-submit"
              accessibilityRole="button"
              accessibilityLabel={t('invite')}
              onPress={sendInvite}
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
                {invite.isPending ? t('working') : t('invite')}
              </Text>
            </PressableScale>
          </Section>

          <View className="gap-sm">
            {teamMembers.map((member) => {
              const name = `${member.first_name} ${member.last_name}`.trim();
              return (
                <View
                  key={member.profile_id}
                  testID={`staff-member-${member.profile_id}`}
                  style={continuousCorners}
                  className="gap-xs rounded-md border border-neutral-200 bg-white p-md"
                >
                  <View className="flex-row flex-wrap items-center justify-between gap-sm">
                    <Text
                      className={`flex-1 text-start text-md font-bold text-neutral-900 ${fontClass}`}
                    >
                      {name}
                    </Text>
                    <Text className={`text-sm font-semibold text-neutral-700 ${fontClass}`}>
                      {member.is_active ? t('statusActive') : t('statusInactive')}
                    </Text>
                  </View>
                  <Text className="text-start text-sm text-neutral-600">{member.email}</Text>
                  <Text
                    testID={`staff-access-${member.profile_id}`}
                    className={`text-start text-sm text-neutral-800 ${fontClass}`}
                  >
                    {`${t('team.accessColumn')}: ${summaryText(member.profile_id)}`}
                  </Text>
                  {member.is_active ? (
                    <View className="flex-row flex-wrap gap-sm">
                      <RowAction
                        testID={`staff-edit-access-${member.profile_id}`}
                        label={t('team.editAccess')}
                        isDisabled={isBusy}
                        onPress={() => {
                          setSheetError(null);
                          setEditingMemberId(member.profile_id);
                        }}
                      />
                      <RowAction
                        testID={`staff-sign-out-${member.profile_id}`}
                        label={tAuth('signOutEverywhereAction')}
                        isDisabled={isBusy}
                        onPress={() =>
                          confirmThen(
                            tAuth('signOutEverywhereAction'),
                            tAuth('signOutEverywhereConfirm'),
                            labels,
                            () =>
                              signOutAll.mutate(
                                member.profile_id,
                                done(tAuth('signOutEverywhereDone')),
                              ),
                          )
                        }
                      />
                      {member.profile_id === user?.id ? null : (
                        <RowAction
                          testID={`staff-reset-factor-${member.profile_id}`}
                          label={tAuth('secondFactorResetAction')}
                          isDisabled={isBusy}
                          onPress={() =>
                            confirmThen(
                              tAuth('secondFactorResetAction'),
                              tAuth('secondFactorResetConfirm'),
                              labels,
                              () =>
                                resetFactor.mutate(
                                  member.profile_id,
                                  done(tAuth('secondFactorResetDone')),
                                ),
                            )
                          }
                        />
                      )}
                      <RowAction
                        testID={`staff-remove-${member.profile_id}`}
                        label={t('remove')}
                        isDisabled={isBusy}
                        isDestructive
                        onPress={() =>
                          confirmThen(t('remove'), t('removeConfirm'), labels, () =>
                            remove.mutate(member.profile_id, done(t('team.removed'))),
                          )
                        }
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <Section title={t('team.presetsTitle')} intro={t('team.presetsIntro')}>
            <PressableScale
              testID="preset-new"
              accessibilityRole="button"
              accessibilityLabel={t('team.newPreset')}
              onPress={() => {
                setSheetError(null);
                setPresetSheet({ preset: null });
              }}
              isDisabled={isBusy}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center self-start rounded-md border border-neutral-300 bg-white px-lg"
            >
              <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
                {t('team.newPreset')}
              </Text>
            </PressableScale>
            {presets.map((preset) => {
              const people = membersUsingPreset(preset.id, access.data?.members ?? []).length;
              return (
                <View
                  key={preset.id}
                  testID={`preset-row-${preset.builtinKey ?? preset.id}`}
                  style={continuousCorners}
                  className="gap-xs rounded-md bg-neutral-50 p-md"
                >
                  <Text className={`text-start text-md font-bold text-neutral-900 ${fontClass}`}>
                    {preset.builtinKey === null
                      ? presetName(preset)
                      : `${presetName(preset)} · ${t('team.builtIn')}`}
                  </Text>
                  <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
                    {t('team.presetSummary', { count: preset.permissions.size, people })}
                  </Text>
                  <View className="flex-row flex-wrap gap-sm">
                    <RowAction
                      testID={`preset-edit-${preset.builtinKey ?? preset.id}`}
                      label={t('team.editPreset')}
                      isDisabled={isBusy}
                      onPress={() => {
                        setSheetError(null);
                        setPresetSheet({ preset });
                      }}
                    />
                    {preset.builtinKey !== null ? (
                      <RowAction
                        testID={`preset-restore-${preset.builtinKey}`}
                        label={t('team.restoreDefault')}
                        isDisabled={isBusy}
                        onPress={() =>
                          restorePreset.mutate(preset.id, done(t('team.presetRestored')))
                        }
                      />
                    ) : (
                      <RowAction
                        testID={`preset-delete-${preset.id}`}
                        label={t('team.deletePreset')}
                        isDisabled={isBusy}
                        isDestructive
                        onPress={() =>
                          confirmThen(t('team.deletePreset'), presetName(preset), labels, () =>
                            deletePreset.mutate(preset.id, done(t('team.presetDeleted'))),
                          )
                        }
                      />
                    )}
                  </View>
                </View>
              );
            })}
          </Section>
        </PageWidth>
      </ScrollView>
      <MemberAccessSheet
        member={editingMember ?? null}
        access={editingMember === undefined ? null : accessOf(editingMember.profile_id)}
        presets={presets}
        presetName={presetName}
        holds={holds}
        isBusy={saveAccess.isPending}
        error={sheetError}
        onClose={() => setEditingMemberId(null)}
        onSave={(permissions, nextPresetId) => {
          if (editingMember === undefined) return;
          saveAccess.mutate(
            { profileId: editingMember.profile_id, permissions, presetId: nextPresetId },
            sheetDone(t('team.accessSaved'), () => setEditingMemberId(null)),
          );
        }}
      />
      <PresetSheet
        visible={presetSheet !== null}
        preset={presetSheet?.preset ?? null}
        presetName={presetName}
        holds={holds}
        isBusy={savePreset.isPending}
        error={sheetError}
        onClose={() => setPresetSheet(null)}
        onSave={(name, permissions) =>
          savePreset.mutate(
            { presetId: presetSheet?.preset?.id ?? null, name, permissions },
            {
              ...sheetDone(t('team.presetSaved'), () => setPresetSheet(null)),
              onSuccess: (savedId) => {
                playHaptic('success');
                setSheetError(null);
                setNotice({ ok: true, text: t('team.presetSaved') });
                setPresetSheet(null);
                // Nobody's access changes on its own: applying the edit is a choice.
                if (membersUsingPreset(savedId, access.data?.members ?? []).length > 0) {
                  setApplyPresetId(savedId);
                }
              },
            },
          )
        }
      />
      <ApplyPresetSheet
        preset={applyingPreset}
        presetName={presetName}
        users={teamMembers.filter((member) =>
          membersUsingPreset(applyPresetId ?? '', access.data?.members ?? []).some(
            (entry) => entry.profileId === member.profile_id,
          ),
        )}
        isBusy={applyPreset.isPending}
        error={sheetError}
        onClose={() => setApplyPresetId(null)}
        onApply={(profileIds) => {
          if (applyPresetId === null) return;
          applyPreset.mutate(
            { presetId: applyPresetId, profileIds },
            sheetDone(t('team.presetApplied', { count: profileIds.length }), () =>
              setApplyPresetId(null),
            ),
          );
        }}
      />
    </SafeAreaView>
  );
}
