import { DrawnCheckmark } from '@/components/motion/drawn-checkmark';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableDepth } from '@/components/motion/pressable-depth';
import { SelectionTransition } from '@/components/motion/selection-transition';
import { continuousCorners } from '@/lib/continuous-corners';
import { useMemo } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import {
  getLanguageFontFamilyKey,
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
const LABEL_CLASS_BY_FAMILY = {
  sans: 'font-sans',
  arabic: 'font-arabic',
  farsi: 'font-farsi',
} as const;

export interface LanguageChoiceListProps {
  readonly selectedLanguage: SupportedLanguage;
  readonly onChoose: (language: SupportedLanguage) => void | Promise<void>;
}

export function LanguageChoiceList({ selectedLanguage, onChoose }: LanguageChoiceListProps) {
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
    <View className="w-full gap-sm">
      {SUPPORTED_LANGUAGES.map((language, index) => {
        const nativeName = LANGUAGE_NATIVE_NAMES[language];
        const isSelected = language === selectedLanguage;
        const fontClass = LABEL_CLASS_BY_FAMILY[getLanguageFontFamilyKey(language)];

        return (
          <FadeSlideIn key={language} index={index} preset="onboarding" composite>
            <PressableDepth
              testID={`auth-language-${language}`}
              accessibilityLabel={nativeName}
              accessibilityRole="radio"
              isSelected={isSelected}
              onPress={() => void onChoose(language)}
              haptic="selection"
              style={wrapperStyle}
              className="relative w-full"
              faceStyle={rowStyle}
              faceClassName={`${ROW_CLASS} bg-white`}
              inlineOffset={tokens.languageChoice.shadowInlineOffset}
              blockOffset={tokens.languageChoice.shadowBlockOffset}
              shadow={
                <View pointerEvents="none" className="rounded-lg bg-primary" style={shadowStyle} />
              }
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
          </FadeSlideIn>
        );
      })}
    </View>
  );
}
