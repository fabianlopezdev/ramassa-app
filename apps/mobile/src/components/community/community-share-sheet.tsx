import { useAppLock } from '@/components/auth/app-lock';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export type CommunityShareChoice = 'post' | 'media' | 'story';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.white },
});
const enabledAccessibilityState = { disabled: false } as const;
const disabledAccessibilityState = { disabled: true } as const;

const choiceSymbols: Readonly<Record<CommunityShareChoice, SymbolViewProps['name']>> = {
  post: { ios: 'text.bubble.fill', android: 'forum', web: 'forum' },
  media: { ios: 'photo.on.rectangle.angled', android: 'photo_library', web: 'photo_library' },
  story: { ios: 'square.and.pencil', android: 'edit_note', web: 'edit_note' },
};
const choiceLabelKeys = {
  post: 'forum:sharePost',
  media: 'forum:shareMedia',
  story: 'forum:shareStory',
} as const satisfies Record<CommunityShareChoice, string>;
const CHOICES: readonly CommunityShareChoice[] = ['post', 'media', 'story'];

const ShareChoiceRow = memo(function ShareChoiceRow({
  choice,
  label,
  isDisabled,
  languageFontClass,
  onChoose,
}: {
  readonly choice: CommunityShareChoice;
  readonly label: string;
  readonly isDisabled: boolean;
  readonly languageFontClass: string;
  readonly onChoose: (choice: CommunityShareChoice) => void;
}) {
  const choose = useCallback(() => {
    playHaptic('tapLight');
    onChoose(choice);
  }, [choice, onChoose]);
  return (
    <Pressable
      testID={`community-share-${choice}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={isDisabled ? disabledAccessibilityState : enabledAccessibilityState}
      disabled={isDisabled}
      onPress={choose}
      style={continuousCorners}
      className={`min-h-recommended flex-row items-center gap-md rounded-lg border border-neutral-200 bg-neutral-50 p-md active:opacity-90 ${isDisabled ? 'opacity-50' : ''}`}
    >
      <SymbolView
        accessible={false}
        name={choiceSymbols[choice]}
        size={tokens.fontSize['2xl']}
        tintColor={tokens.colors.primary.DEFAULT}
      />
      <Text className={`flex-1 text-start text-lg font-bold text-neutral-900 ${languageFontClass}`}>
        {label}
      </Text>
    </Pressable>
  );
});

/**
 * The one "Comparteix" entry of Comunitat (RAPP-792): three large choices,
 * icon plus label. Native pressables, because a native Modal owns a separate
 * Android root outside the app's gesture root (see the forum flag dialog).
 */
export function CommunityShareSheet({
  visible,
  isPostDisabled,
  onChoose,
  onClose,
}: {
  readonly visible: boolean;
  /** Writing a forum post needs a connection; the other two screens handle it. */
  readonly isPostDisabled: boolean;
  readonly onChoose: (choice: CommunityShareChoice) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation(['forum', 'common']);
  const languageFontClass = useLanguageFontClass();
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  const pressClose = useCallback(() => {
    playHaptic('tapLight');
    onClose();
  }, [onClose]);
  const renderChoice = useCallback(
    (choice: CommunityShareChoice) => (
      <ShareChoiceRow
        key={choice}
        choice={choice}
        label={t(choiceLabelKeys[choice])}
        isDisabled={choice === 'post' && isPostDisabled}
        languageFontClass={languageFontClass}
        onChoose={onChoose}
      />
    ),
    [isPostDisabled, languageFontClass, onChoose, t],
  );

  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen}>
        <ScrollView
          testID="community-share-sheet"
          contentContainerClassName="gap-lg p-lg"
          contentInsetAdjustmentBehavior="automatic"
        >
          <Text
            accessibilityRole="header"
            className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
          >
            {t('forum:share')}
          </Text>
          <View className="gap-sm">{CHOICES.map(renderChoice)}</View>
          <Pressable
            testID="community-share-close"
            accessibilityRole="button"
            accessibilityLabel={t('common:close')}
            onPress={pressClose}
            style={continuousCorners}
            className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 px-lg active:opacity-90"
          >
            <Text className={`font-bold text-neutral-700 ${languageFontClass}`}>
              {t('common:close')}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
