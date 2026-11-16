import { AppSheet } from '@/components/layout/app-sheet';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { tokens } from '@ramassa/shared/tokens';

export type CommunityShareChoice = 'post' | 'media' | 'story';

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
  const choose = useCallback(() => onChoose(choice), [choice, onChoose]);
  return (
    <PressableScale
      testID={`community-share-${choice}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      isDisabled={isDisabled}
      onPress={choose}
      haptic="tapLight"
      style={continuousCorners}
      className={`min-h-recommended flex-row items-center gap-md rounded-lg border border-neutral-200 bg-neutral-50 p-md ${isDisabled ? 'opacity-50' : ''}`}
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
    </PressableScale>
  );
});

/**
 * The one "Comparteix" entry of Comunitat (RAPP-792): three large choices,
 * icon plus label, in the shared sheet frame.
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
  const { t } = useTranslation('forum');
  const languageFontClass = useLanguageFontClass();
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
    <AppSheet
      testID="community-share-sheet"
      closeTestID="community-share-close"
      title={t('share')}
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-sm">{CHOICES.map(renderChoice)}</View>
    </AppSheet>
  );
}
