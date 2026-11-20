/**
 * Creating or changing a custom notification group on the phone (RAPP-389),
 * in a sheet, as the web admin's group form: a name, and the participants
 * picked from a search that ignores case and accents. The selection is kept
 * while the search changes. Groups are not deleted here, as in the web admin.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FieldLabel } from '@/components/forms/field-label';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { NativeModalScope } from '@/components/motion/native-modal-scope';
import { playHaptic } from '@/lib/haptics/haptics';
import { useNotificationActions } from '@/lib/team-notifications';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  filterNotificationGroupParticipants,
  type CustomNotificationGroup,
  type NotificationAudienceOptions,
} from '@ramassa/shared/notifications';

const NAME_MAX = 80;

function GroupForm({
  group,
  participants,
  onClose,
}: {
  readonly group: CustomNotificationGroup | null;
  readonly participants: NotificationAudienceOptions['participants'];
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('notifications');
  const { t: tProfile } = useTranslation('profile');
  const fontClass = useLanguageFontClass();
  const { saveGroup } = useNotificationActions();
  const [name, setName] = useState(group?.name ?? '');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(group?.participantIds ?? []),
  );
  const [hasFailed, setHasFailed] = useState(false);
  const visible = useMemo(
    () => filterNotificationGroupParticipants(participants, search),
    [participants, search],
  );

  const toggle = (participantId: string) => {
    setHasFailed(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  };

  const submit = () => {
    setHasFailed(false);
    saveGroup.mutate(
      {
        ...(group === null ? {} : { id: group.id }),
        name,
        // In the participants' own order, so a save is the same every time.
        participantIds: participants
          .filter((participant) => selected.has(participant.id))
          .map((participant) => participant.id),
      },
      {
        onSuccess: () => {
          playHaptic('success');
          onClose();
        },
        onError: () => {
          playHaptic('error');
          setHasFailed(true);
        },
      },
    );
  };

  const canSave = name.trim().length > 0 && !saveGroup.isPending;

  return (
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
        {group === null ? t('newGroup') : group.name}
      </Text>
      <AuthTextField
        testID="notification-group-name"
        label={t('groupName')}
        value={name}
        onChangeText={(value) => {
          setHasFailed(false);
          setName(value);
        }}
        maxLength={NAME_MAX}
      />
      <AuthTextField
        testID="notification-group-search"
        label={t('groupSearch')}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />
      <View className="gap-sm">
        <View className="flex-row flex-wrap items-center justify-between gap-sm">
          <FieldLabel>{t('groupMembers')}</FieldLabel>
          <Text
            testID="notification-group-selected"
            className={`text-sm font-semibold tabular-nums text-neutral-700 ${fontClass}`}
          >
            {t('groupSelected', { count: selected.size })}
          </Text>
        </View>
        {visible.length === 0 ? (
          <Text
            testID="notification-group-empty"
            className={`text-start text-md text-neutral-600 ${fontClass}`}
          >
            {t('groupEmpty')}
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-sm">
            {visible.map((participant) => (
              <ChoiceOption
                key={participant.id}
                testID={`notification-group-member-${participant.id}`}
                value={participant.id}
                label={participant.fullName}
                selected={selected.has(participant.id)}
                onSelect={toggle}
                languageFontClass={fontClass}
              />
            ))}
          </View>
        )}
      </View>
      {hasFailed ? (
        <Text
          accessibilityLiveRegion="polite"
          className={`text-start text-sm text-error ${fontClass}`}
        >
          {t('error')}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-sm">
        <AuthSubmitButton
          testID="notification-group-save"
          label={t('saveGroup')}
          onPress={submit}
          isLoading={saveGroup.isPending}
          disabled={!canSave}
        />
        <RaisedActionButton
          testID="notification-group-cancel"
          label={tProfile('cancelAction')}
          onPress={onClose}
        />
      </View>
    </ScrollView>
  );
}

export function NotificationGroupSheet({
  visible,
  group,
  participants,
  onClose,
}: {
  readonly visible: boolean;
  /** The group to change, or null for a new one. */
  readonly group: CustomNotificationGroup | null;
  readonly participants: NotificationAudienceOptions['participants'];
  readonly onClose: () => void;
}) {
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <NativeModalScope>
        <SafeAreaView className="flex-1 bg-white" testID="notification-group-sheet">
          <KeyboardAvoidingView
            className="flex-1"
            behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
          >
            {visible ? (
              <GroupForm
                key={group?.id ?? 'new'}
                group={group}
                participants={participants}
                onClose={onClose}
              />
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </NativeModalScope>
    </Modal>
  );
}
