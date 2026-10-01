import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableScale } from '@/components/motion/pressable-scale';
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

const ROW_CLASS = 'relative w-full flex-row items-center justify-between rounded-md bg-white px-lg';
const SELECTED_ROW_CLASS = 'absolute inset-0 rounded-md border-2 border-primary bg-primary/10';
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
      height: tokens.onboarding.languageRowHeight * Math.max(1, fontScale),
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
          <FadeSlideIn key={language} index={index} preset="onboarding">
            <PressableScale
              testID={`auth-language-${language}`}
              accessibilityLabel={nativeName}
              accessibilityRole="radio"
              isSelected={isSelected}
              onPress={() => void onChoose(language)}
              haptic="selection"
              style={rowStyle}
              className={ROW_CLASS}
            >
              <View
                pointerEvents="none"
                className="absolute inset-0 rounded-md border-2 border-neutral-300"
                style={continuousCorners}
              />
              <SelectionTransition
                active={isSelected}
                className={SELECTED_ROW_CLASS}
                style={continuousCorners}
              />
              <Text
                accessibilityLanguage={language}
                className={`text-start text-lg font-medium text-neutral-900 ${fontClass}`}
              >
                {nativeName}
              </Text>
              <SelectionTransition active={isSelected} emphasis>
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  className="text-xl font-bold text-primary"
                >
                  {String.fromCodePoint(0x2713)}
                </Text>
              </SelectionTransition>
            </PressableScale>
          </FadeSlideIn>
        );
      })}
    </View>
  );
}
