import { DrawnCheckmark } from '@/components/motion/drawn-checkmark';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
import { fontClassForLanguage } from '@/lib/language-font-class';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const ROW_CLASS =
  'relative w-full flex-row items-center justify-between overflow-hidden rounded-lg border border-primary px-lg';
const wrapperStyle = {
  paddingEnd: tokens.languageChoice.shadowInlineOffset,
  paddingBottom: tokens.languageChoice.shadowBlockOffset,
} as const;
const shadowStyle = {
  ...continuousCorners,
  position: 'absolute',
  top: tokens.languageChoice.shadowBlockOffset,
  start: tokens.languageChoice.shadowInlineOffset,
  end: 0,
  bottom: 0,
} as const;

export interface LanguageChoiceListProps {
  readonly selectedLanguage: SupportedLanguage;
  readonly onChoose: (language: SupportedLanguage) => void | Promise<void>;
}

/**
 * Memoized so a selection change re-renders only the two rows whose state
 * flips, and each row keeps a stable press handler (and so a stable tap
 * gesture) across selections.
 */
const LanguageChoiceOption = memo(function LanguageChoiceOption({
  language,
  isSelected,
  rowStyle,
  onChoose,
}: {
  readonly language: SupportedLanguage;
  readonly isSelected: boolean;
  readonly rowStyle: StyleProp<ViewStyle>;
  readonly onChoose: LanguageChoiceListProps['onChoose'];
}) {
  const nativeName = LANGUAGE_NATIVE_NAMES[language];
  const fontClass = fontClassForLanguage(language);
  const handlePress = useCallback(() => void onChoose(language), [language, onChoose]);

  return (
    <PressableDepth
      testID={`auth-language-${language}`}
      accessibilityLabel={nativeName}
      accessibilityRole="radio"
      isSelected={isSelected}
      onPress={handlePress}
      haptic="selection"
      style={wrapperStyle}
      className="relative w-full"
      faceStyle={rowStyle}
      faceClassName={`${ROW_CLASS} bg-white`}
      inlineOffset={tokens.languageChoice.shadowInlineOffset}
      blockOffset={tokens.languageChoice.shadowBlockOffset}
      shadow={<View pointerEvents="none" className="rounded-lg bg-primary" style={shadowStyle} />}
    >
      <SelectionTransition
        active={isSelected}
        duration="base"
        className="absolute inset-0 bg-secondary"
        style={continuousCorners}
      />
      <Text
        accessibilityLanguage={language}
        className={`text-start text-lg font-medium text-primary ${fontClass}`}
      >
        {nativeName}
      </Text>
      <DrawnCheckmark active={isSelected} />
    </PressableDepth>
  );
});

export function LanguageChoiceList({ selectedLanguage, onChoose }: LanguageChoiceListProps) {
  const { t } = useTranslation('auth');
  const { fontScale } = useWindowDimensions();
  const rowStyle = useMemo(
    () => ({
      ...continuousCorners,
      height:
        tokens.onboarding.languageRowHeight * Math.max(1, fontScale) -
        tokens.languageChoice.shadowBlockOffset,
    }),
    [fontScale],
  );
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('languageTitle')}
      className="w-full gap-sm"
    >
      {SUPPORTED_LANGUAGES.map((language, index) => (
        <FadeSlideIn key={language} index={index} preset="onboarding" composite>
          <LanguageChoiceOption
            language={language}
            isSelected={language === selectedLanguage}
            rowStyle={rowStyle}
            onChoose={onChoose}
          />
        </FadeSlideIn>
      ))}
    </View>
  );
}
