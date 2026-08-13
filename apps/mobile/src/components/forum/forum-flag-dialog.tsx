import { AuthTextField } from '@/components/auth/auth-text-field';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useFlagForumContent } from '@/lib/player-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useCallback, useState } from 'react';
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.white },
  comment: { minHeight: tokens.spacing['3xl'] * 2 },
});
const selectedRadioAccessibilityState = { checked: true, selected: true } as const;
const unselectedRadioAccessibilityState = { checked: false, selected: false } as const;
const enabledButtonAccessibilityState = { busy: false, disabled: false } as const;
const busyButtonAccessibilityState = { busy: true, disabled: true } as const;

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
  const [reason, setReason] = useState<ForumFlagInput['reason'] | null>(null);
  const [comment, setComment] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);

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
      await flagMutation.mutateAsync({ ...target, reason, comment });
      setReason(null);
      setComment('');
      onConfirmed();
    } catch (error) {
      setErrorCode(toAppError(error).code);
    }
  }, [comment, flagMutation, onConfirmed, reason, target]);

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
            {FORUM_FLAG_REASONS.map((candidate) => {
              const selected = reason === candidate;
              const label = t(`flagReasons.${candidate}`);
              return (
                <Pressable
                  key={candidate}
                  testID={`forum-flag-reason-${candidate}`}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={
                    selected ? selectedRadioAccessibilityState : unselectedRadioAccessibilityState
                  }
                  onPress={() => {
                    playHaptic('selection');
                    setReason(candidate);
                  }}
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
            })}
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
              onPress={() => {
                playHaptic('tapLight');
                void submit();
              }}
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
              onPress={() => {
                playHaptic('tapLight');
                close();
              }}
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
