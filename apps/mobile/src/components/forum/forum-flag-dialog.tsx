import { AuthTextField } from '@/components/auth/auth-text-field';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useFlagForumContent } from '@/lib/player-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import {
  FORUM_FLAG_COMMENT_MAX_LENGTH,
  FORUM_FLAG_REASONS,
  type ForumFlagInput,
} from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const FORUM_FLAG_COMMENT_MIN_HEIGHT = tokens.spacing['3xl'] * 2;
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.white },
  comment: { minHeight: FORUM_FLAG_COMMENT_MIN_HEIGHT, writingDirection: 'auto' },
});
const selectedRadioAccessibilityState = { checked: true, selected: true } as const;
const unselectedRadioAccessibilityState = { checked: false, selected: false } as const;
const enabledButtonAccessibilityState = { busy: false, disabled: false } as const;
const busyButtonAccessibilityState = { busy: true, disabled: true } as const;

const ForumFlagReasonOption = memo(function ForumFlagReasonOption({
  candidate,
  label,
  selected,
  languageFontClass,
  onSelect,
}: {
  readonly candidate: ForumFlagInput['reason'];
  readonly label: string;
  readonly selected: boolean;
  readonly languageFontClass: string;
  readonly onSelect: (candidate: ForumFlagInput['reason']) => void;
}) {
  const select = useCallback(() => {
    playHaptic('selection');
    onSelect(candidate);
  }, [candidate, onSelect]);

  return (
    <Pressable
      testID={`forum-flag-reason-${candidate}`}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={
        selected ? selectedRadioAccessibilityState : unselectedRadioAccessibilityState
      }
      onPress={select}
      style={continuousCorners}
      className={`min-h-recommended justify-center rounded-md border px-lg active:opacity-90 ${selected ? 'border-primary bg-primary' : 'border-neutral-300 bg-white'}`}
    >
      <Text
        className={`text-start font-semibold ${selected ? 'text-white' : 'text-neutral-800'} ${languageFontClass}`}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export interface ForumFlagDialogProps {
  readonly target: Readonly<Pick<ForumFlagInput, 'targetType' | 'targetId'>> | null;
  readonly postId?: string;
  readonly onClose: () => void;
  readonly onConfirmed: () => void;
}

export function ForumFlagDialog({ target, postId, onClose, onConfirmed }: ForumFlagDialogProps) {
  const { t } = useTranslation('forum');
  const languageFontClass = useLanguageFontClass();
  const flagMutation = useFlagForumContent(postId);
  const submitFlag = flagMutation.mutateAsync;
  const [reason, setReason] = useState<ForumFlagInput['reason'] | null>(null);
  const [comment, setComment] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const selectReason = useCallback((candidate: ForumFlagInput['reason']) => {
    setReason(candidate);
  }, []);

  const close = useCallback(() => {
    if (flagMutation.isPending) return;
    setReason(null);
    setComment('');
    setErrorCode(null);
    onClose();
  }, [flagMutation.isPending, onClose]);

  const submit = useCallback(async () => {
    if (target === null || reason === null) {
      setErrorCode('VALIDATION-1');
      return;
    }
    setErrorCode(null);
    try {
      await submitFlag({ ...target, reason, comment });
      setReason(null);
      setComment('');
      onConfirmed();
    } catch (error) {
      setErrorCode(toAppError(error).code);
    }
  }, [comment, onConfirmed, reason, submitFlag, target]);
  const pressSubmit = useCallback(() => {
    playHaptic('tapLight');
    void submit();
  }, [submit]);
  const pressClose = useCallback(() => {
    playHaptic('tapLight');
    close();
  }, [close]);
  const renderReason = useCallback(
    (candidate: ForumFlagInput['reason']) => (
      <ForumFlagReasonOption
        key={candidate}
        candidate={candidate}
        label={t(`flagReasons.${candidate}`)}
        selected={reason === candidate}
        languageFontClass={languageFontClass}
        onSelect={selectReason}
      />
    ),
    [languageFontClass, reason, selectReason, t],
  );

  return (
    <Modal
      visible={target !== null}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.screen}>
        <ScrollView
          contentContainerClassName="grow gap-lg p-lg"
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('flagTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('flagIntro')}
            </Text>
          </View>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t('flagReasonLabel')}
            className="gap-sm"
          >
            {/* A native Modal owns a separate Android root outside the app's
                gesture root. Native pressables remain interactive here without
                nesting another GestureHandlerRootView, which crashes Fabric. */}
            {FORUM_FLAG_REASONS.map(renderReason)}
          </View>
          <AuthTextField
            testID="forum-flag-comment"
            label={t('flagCommentLabel')}
            placeholder={t('flagCommentPlaceholder')}
            value={comment}
            onChangeText={setComment}
            maxLength={FORUM_FLAG_COMMENT_MAX_LENGTH}
            multiline
            textAlignVertical="top"
            style={styles.comment}
          />
          {errorCode === null ? null : (
            <Text
              selectable
              accessibilityRole="alert"
              className={`text-start text-sm text-error ${languageFontClass}`}
            >
              {errorCode === 'VALIDATION-1' ? t('flagReasonRequired') : t('flagFailed')}
            </Text>
          )}
          <View className="gap-sm">
            <Pressable
              testID="forum-flag-submit"
              accessibilityRole="button"
              accessibilityLabel={flagMutation.isPending ? t('flagSubmitting') : t('flagSubmit')}
              accessibilityState={
                flagMutation.isPending
                  ? busyButtonAccessibilityState
                  : enabledButtonAccessibilityState
              }
              disabled={flagMutation.isPending}
              onPress={pressSubmit}
              style={continuousCorners}
              className={`min-h-recommended flex-row items-center justify-center gap-sm rounded-md bg-primary px-lg active:opacity-90 ${flagMutation.isPending ? 'opacity-60' : ''}`}
            >
              {flagMutation.isPending ? (
                <ActivityIndicator accessible={false} color={tokens.colors.white} />
              ) : null}
              <Text className={`text-lg font-bold text-white ${languageFontClass}`}>
                {flagMutation.isPending ? t('flagSubmitting') : t('flagSubmit')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
              accessibilityState={
                flagMutation.isPending
                  ? busyButtonAccessibilityState
                  : enabledButtonAccessibilityState
              }
              disabled={flagMutation.isPending}
              onPress={pressClose}
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg active:opacity-90"
            >
              <Text className={`font-bold text-neutral-700 ${languageFontClass}`}>
                {t('cancel')}
              </Text>
            </Pressable>
          </View>
          <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
            {t('flagPrivacy')}
          </Text>
          <Text className="sr-only">{t('flagConfirmation')}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
