/**
 * The reply field of a forum post (RAPP-884), in the screen's bottom action
 * area once she taps "Respon": who she answers with a close button, the text
 * area, the characters left, the error and the navy "Respon". The screen keeps
 * the draft and the target; this only draws them.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { Icon } from '@/components/icons/icon';
import { ShakeOnError } from '@/components/motion/shake-on-error';
import { memo, useEffect, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, View, type TextInput } from 'react-native';
import type { AppErrorCode } from '@ramassa/shared/errors';
import { FORUM_REPLY_MAX_LENGTH } from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

// At rest the field is three lines tall, so it reads as a text area. It grows
// with her text up to five lines and then scrolls inside, so the message she
// answers keeps its name and first line in view above it.
const FORUM_REPLY_RESTING_LINES = 3;
const FORUM_REPLY_MOST_LINES = 5;
const styles = StyleSheet.create({
  replyInput: {
    minHeight: tokens.lineHeight.body * FORUM_REPLY_RESTING_LINES,
    maxHeight: tokens.lineHeight.body * FORUM_REPLY_MOST_LINES,
    writingDirection: 'auto',
  },
});

export const ForumReplyComposer = memo(function ForumReplyComposer({
  name,
  text,
  inputRef,
  onChangeText,
  onClose,
  onSubmit,
  isSubmitting,
  isSubmitDisabled,
  errorMessage,
  errorCode,
  languageFontClass,
  onKeyboardShown,
}: {
  /** The name of the person she answers. */
  readonly name: string;
  readonly text: string;
  readonly inputRef: Ref<TextInput>;
  readonly onChangeText: (text: string) => void;
  readonly onClose: () => void;
  readonly onSubmit: () => void;
  readonly isSubmitting: boolean;
  readonly isSubmitDisabled: boolean;
  /** The sentence under the field when sending failed or the answer is empty. */
  readonly errorMessage: string | null;
  /** Shakes the error when it changes. */
  readonly errorCode: AppErrorCode | null;
  readonly languageFontClass: string;
  /** Once the keyboard has finished opening over the screen. */
  readonly onKeyboardShown: () => void;
}) {
  const { t } = useTranslation(['forum', 'common']);
  useEffect(() => {
    const keyboardShown = Keyboard.addListener('keyboardDidShow', onKeyboardShown);
    return () => keyboardShown.remove();
  }, [onKeyboardShown]);
  const replyingTo = t('forum:replyingTo', { name });
  return (
    <View className="gap-sm">
      <View className="flex-row items-center gap-sm">
        <Icon
          name="reply"
          weight="boldDuotone"
          size={tokens.fontSize.xl}
          color={tokens.colors.primary.DEFAULT}
        />
        <Text
          className={`flex-1 text-start text-md font-bold text-neutral-900 ${languageFontClass}`}
        >
          {replyingTo}
        </Text>
        <View>
          <RaisedActionButton
            testID="forum-reply-close"
            size="compact"
            icon="close"
            isLabelHidden
            label={t('common:close')}
            onPress={onClose}
          />
        </View>
      </View>
      <AuthTextField
        ref={inputRef}
        testID="forum-reply-content"
        label={replyingTo}
        isLabelVisible={false}
        placeholder={t('forum:replyPlaceholder')}
        value={text}
        onChangeText={onChangeText}
        maxLength={FORUM_REPLY_MAX_LENGTH}
        multiline
        autoFocus
        textAlignVertical="top"
        style={styles.replyInput}
      />
      <Text className={`text-end text-sm tabular-nums text-neutral-600 ${languageFontClass}`}>
        {t('forum:charactersRemaining', { count: FORUM_REPLY_MAX_LENGTH - text.length })}
      </Text>
      <ShakeOnError errorCode={errorCode}>
        {errorMessage === null ? null : (
          <Text
            selectable
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className={`text-start text-sm text-error ${languageFontClass}`}
          >
            {errorMessage}
          </Text>
        )}
      </ShakeOnError>
      <AuthSubmitButton
        testID="forum-submit-reply"
        label={isSubmitting ? t('forum:replying') : t('forum:reply')}
        onPress={onSubmit}
        isLoading={isSubmitting}
        disabled={isSubmitDisabled}
      />
    </View>
  );
});
