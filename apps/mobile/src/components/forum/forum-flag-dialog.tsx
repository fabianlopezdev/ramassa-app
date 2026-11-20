import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { SelectionChoiceCard } from '@/components/auth/selection-choice-card';
import { AppSheet } from '@/components/layout/app-sheet';
import { useFlagForumContent } from '@/lib/player-forum';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { toAppError } from '@ramassa/shared/errors';
import {
  FORUM_FLAG_COMMENT_MAX_LENGTH,
  FORUM_FLAG_REASONS,
  type ForumFlagInput,
} from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

const FORUM_FLAG_COMMENT_MIN_HEIGHT = tokens.spacing['3xl'] * 2;
const styles = StyleSheet.create({
  comment: { minHeight: FORUM_FLAG_COMMENT_MIN_HEIGHT, writingDirection: 'auto' },
});

/**
 * One reason, on the raised choice card onboarding uses for a choice
 * (RAPP-881), so picking a reason looks and presses like picking a language.
 */
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
  const select = useCallback(() => onSelect(candidate), [candidate, onSelect]);

  return (
    <SelectionChoiceCard
      testID={`forum-flag-reason-${candidate}`}
      label={label}
      fontClass={languageFontClass}
      isSelected={selected}
      onPress={select}
    />
  );
});

export interface ForumFlagDialogProps {
  readonly target: Readonly<Pick<ForumFlagInput, 'targetType' | 'targetId'>> | null;
  readonly postId?: string;
  readonly onClose: () => void;
  readonly onConfirmed: () => void;
}

/**
 * The report sheet ("Avisa l'equip tècnic"), in the app's one sheet frame
 * (RAPP-881): the reasons, an optional note, and "Envia l'avís" as the action
 * at the bottom with the privacy line above it. She leaves without sending by
 * dragging the sheet down.
 */
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
  const pressSubmit = useCallback(() => void submit(), [submit]);
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
    <AppSheet
      testID="forum-flag-sheet"
      title={t('flagTitle')}
      visible={target !== null}
      onClose={close}
      action={
        <>
          <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
            {t('flagPrivacy')}
          </Text>
          <AuthSubmitButton
            testID="forum-flag-submit"
            label={flagMutation.isPending ? t('flagSubmitting') : t('flagSubmit')}
            onPress={pressSubmit}
            isLoading={flagMutation.isPending}
          />
        </>
      }
    >
      <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
        {t('flagIntro')}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('flagReasonLabel')}
        className="gap-sm"
      >
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
      <Text className="sr-only">{t('flagConfirmation')}</Text>
    </AppSheet>
  );
}
