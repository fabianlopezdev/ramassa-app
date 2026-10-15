/**
 * The sheets of the team's access on the phone (RAPP-405), as the web admin's
 * dialogs: a person's access (start from a preset, then single switches), a
 * preset (its name and switches), and, after a preset in use changes, whom
 * to apply it to (everyone, some, or nobody). Nobody's access changes on its
 * own: applying an edited preset is a choice. A refusal shows in the sheet.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { PermissionToggles } from '@/components/team/permission-toggles';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StaffMember } from '@ramassa/shared/organization-settings';
import {
  presetWithinReach,
  sameCodes,
  type PermissionCode,
  type PermissionPreset,
  type TeamMemberAccess,
} from '@ramassa/shared/permissions';

const NAME_MAX = 80;

function Sheet({
  testID,
  visible,
  onClose,
  children,
}: {
  readonly testID: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
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
      <SafeAreaView className="flex-1 bg-white" testID={testID}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerClassName="gap-md p-lg"
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {visible ? children : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function SheetHeader({ title, intro }: { readonly title: string; readonly intro: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-xs">
      <Text
        accessibilityRole="header"
        className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
      >
        {title}
      </Text>
      <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>{intro}</Text>
    </View>
  );
}

function SheetButtons({
  testIDPrefix,
  saveLabel,
  isBusy,
  isDisabled,
  onSave,
  onClose,
  error,
}: {
  readonly testIDPrefix: string;
  readonly saveLabel: string;
  readonly isBusy: boolean;
  readonly isDisabled: boolean;
  readonly onSave: () => void;
  readonly onClose: () => void;
  readonly error: string | null;
}) {
  const { t } = useTranslation('settings');
  const fontClass = useLanguageFontClass();
  return (
    <View className="gap-sm">
      {error === null ? null : (
        <Text
          testID={`${testIDPrefix}-error`}
          accessibilityLiveRegion="polite"
          className={`text-start text-md text-error ${fontClass}`}
        >
          {error}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-sm">
        <PressableScale
          testID={`${testIDPrefix}-save`}
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
          onPress={onSave}
          isBusy={isBusy}
          isDisabled={isDisabled}
          haptic="tapLight"
          style={continuousCorners}
          className={`min-h-recommended items-center justify-center rounded-md px-lg ${
            isDisabled ? 'bg-neutral-200' : 'bg-primary'
          }`}
        >
          <Text
            className={`text-center text-md font-bold ${isDisabled ? 'text-neutral-500' : 'text-white'} ${fontClass}`}
          >
            {isBusy ? t('working') : saveLabel}
          </Text>
        </PressableScale>
        <PressableScale
          testID={`${testIDPrefix}-cancel`}
          accessibilityRole="button"
          accessibilityLabel={t('cancel')}
          onPress={onClose}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
        >
          <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
            {t('cancel')}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

function MemberAccessForm({
  member,
  access,
  presets,
  presetName,
  holds,
  isBusy,
  error,
  onSave,
  onClose,
}: {
  readonly member: StaffMember;
  readonly access: TeamMemberAccess;
  readonly presets: readonly PermissionPreset[];
  readonly presetName: (preset: PermissionPreset) => string;
  readonly holds: (code: PermissionCode) => boolean;
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onSave: (permissions: ReadonlySet<PermissionCode>, presetId: string | null) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('settings');
  const fontClass = useLanguageFontClass();
  const [permissions, setPermissions] = useState(access.permissions);
  const [presetId, setPresetId] = useState(access.presetId);
  const [chosenId, setChosenId] = useState(access.presetId ?? presets[0]?.id ?? '');
  const chosen = presets.find((preset) => preset.id === chosenId);
  const isUnchanged = sameCodes(permissions, access.permissions) && presetId === access.presetId;

  return (
    <>
      <SheetHeader
        title={t('team.editAccessTitle', { name: `${member.first_name} ${member.last_name}` })}
        intro={t('team.editAccessIntro')}
      />
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {t('team.presetLabel')}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        {presets.map((preset) => (
          <ChoiceOption
            key={preset.id}
            testID={`member-access-preset-${preset.builtinKey ?? preset.id}`}
            value={preset.id}
            label={presetName(preset)}
            selected={preset.id === chosenId}
            onSelect={setChosenId}
            languageFontClass={fontClass}
          />
        ))}
      </View>
      <PressableScale
        testID="member-access-use-preset"
        accessibilityRole="button"
        accessibilityLabel={t('team.usePreset')}
        onPress={() => {
          if (chosen === undefined) return;
          setPermissions((current) => presetWithinReach(current, chosen, holds));
          setPresetId(chosen.id);
        }}
        isDisabled={chosen === undefined}
        haptic="tapLight"
        style={continuousCorners}
        className="min-h-recommended items-center justify-center self-start rounded-md border border-primary bg-white px-lg"
      >
        <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
          {t('team.usePreset')}
        </Text>
      </PressableScale>
      <PermissionToggles value={permissions} onChange={setPermissions} holds={holds} />
      <SheetButtons
        testIDPrefix="member-access"
        saveLabel={t('save')}
        isBusy={isBusy}
        isDisabled={isBusy || isUnchanged}
        onSave={() => onSave(permissions, presetId)}
        onClose={onClose}
        error={error}
      />
    </>
  );
}

export function MemberAccessSheet(
  props: Omit<Parameters<typeof MemberAccessForm>[0], 'member' | 'access'> & {
    readonly member: StaffMember | null;
    readonly access: TeamMemberAccess | null;
  },
) {
  const { member, access, ...rest } = props;
  return (
    <Sheet testID="member-access-sheet" visible={member !== null} onClose={rest.onClose}>
      {member === null || access === null ? null : (
        <MemberAccessForm key={member.profile_id} member={member} access={access} {...rest} />
      )}
    </Sheet>
  );
}

function PresetForm({
  preset,
  presetName,
  holds,
  isBusy,
  error,
  onSave,
  onClose,
}: {
  /** The preset to change, or null for a new one. */
  readonly preset: PermissionPreset | null;
  readonly presetName: (preset: PermissionPreset) => string;
  readonly holds: (code: PermissionCode) => boolean;
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onSave: (name: string | null, permissions: ReadonlySet<PermissionCode>) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('settings');
  const [name, setName] = useState(preset?.name ?? '');
  const [permissions, setPermissions] = useState<ReadonlySet<PermissionCode>>(
    preset?.permissions ?? new Set(),
  );
  const isBuiltIn = preset?.builtinKey != null;

  return (
    <>
      <SheetHeader
        title={
          preset === null
            ? t('team.newPreset')
            : t('team.editPresetTitle', { name: presetName(preset) })
        }
        intro={t('team.editPresetIntro')}
      />
      <AuthTextField
        testID="preset-name"
        label={t('team.presetName')}
        value={name}
        onChangeText={setName}
        placeholder={preset !== null && isBuiltIn ? presetName({ ...preset, name: null }) : ''}
        maxLength={NAME_MAX}
      />
      <PermissionToggles value={permissions} onChange={setPermissions} holds={holds} />
      <SheetButtons
        testIDPrefix="preset"
        saveLabel={t('save')}
        isBusy={isBusy}
        isDisabled={isBusy || (!isBuiltIn && name.trim() === '')}
        onSave={() => onSave(name.trim() === '' ? null : name.trim(), permissions)}
        onClose={onClose}
        error={error}
      />
    </>
  );
}

export function PresetSheet(
  props: Parameters<typeof PresetForm>[0] & { readonly visible: boolean },
) {
  const { visible, ...rest } = props;
  return (
    <Sheet testID="preset-sheet" visible={visible} onClose={rest.onClose}>
      <PresetForm key={rest.preset?.id ?? 'new'} {...rest} />
    </Sheet>
  );
}

type ApplyScope = 'everyone' | 'some' | 'nobody';
const APPLY_SCOPES: readonly ApplyScope[] = ['everyone', 'some', 'nobody'];

function ApplyPresetForm({
  preset,
  presetName,
  users,
  isBusy,
  error,
  onApply,
  onClose,
}: {
  readonly preset: PermissionPreset;
  readonly presetName: (preset: PermissionPreset) => string;
  /** The people who use the preset now. */
  readonly users: readonly StaffMember[];
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly onApply: (profileIds: readonly string[]) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('settings');
  const fontClass = useLanguageFontClass();
  const [scope, setScope] = useState<ApplyScope>('everyone');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const targets =
    scope === 'everyone'
      ? users.map((user) => user.profile_id)
      : scope === 'some'
        ? [...chosen]
        : [];

  return (
    <>
      <SheetHeader
        title={t('team.applyTitle', { count: users.length, preset: presetName(preset) })}
        intro={t('team.applyIntro')}
      />
      <View className="flex-row flex-wrap gap-sm">
        {APPLY_SCOPES.map((option) => (
          <ChoiceOption
            key={option}
            testID={`apply-preset-${option}`}
            value={option}
            label={t(`team.apply.${option}`, { count: users.length })}
            selected={option === scope}
            onSelect={setScope}
            languageFontClass={fontClass}
          />
        ))}
      </View>
      {scope === 'some' ? (
        <View className="flex-row flex-wrap gap-sm">
          {users.map((user) => (
            <ChoiceOption
              key={user.profile_id}
              testID={`apply-preset-person-${user.profile_id}`}
              value={user.profile_id}
              label={`${user.first_name} ${user.last_name}`}
              selected={chosen.has(user.profile_id)}
              onSelect={(id) =>
                setChosen((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              languageFontClass={fontClass}
            />
          ))}
        </View>
      ) : null}
      <SheetButtons
        testIDPrefix="apply-preset"
        saveLabel={t('confirm')}
        isBusy={isBusy}
        isDisabled={isBusy}
        onSave={() => (targets.length === 0 ? onClose() : onApply(targets))}
        onClose={onClose}
        error={error}
      />
    </>
  );
}

export function ApplyPresetSheet(
  props: Omit<Parameters<typeof ApplyPresetForm>[0], 'preset'> & {
    readonly preset: PermissionPreset | null;
  },
) {
  const { preset, ...rest } = props;
  return (
    <Sheet testID="apply-preset-sheet" visible={preset !== null} onClose={rest.onClose}>
      {preset === null ? null : <ApplyPresetForm key={preset.id} preset={preset} {...rest} />}
    </Sheet>
  );
}
