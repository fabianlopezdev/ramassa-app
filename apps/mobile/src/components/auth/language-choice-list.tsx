import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { Text, View } from 'react-native';
import {
  getLanguageFontFamilyKey,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

const ROW_CLASS =
  'min-h-recommended w-full flex-row items-center justify-between rounded-md border border-neutral-300 bg-white px-lg py-md';
const SELECTED_ROW_CLASS =
  'min-h-recommended w-full flex-row items-center justify-between rounded-md border-2 border-primary bg-primary/10 px-lg py-md';
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
  return (
    <View className="w-full gap-sm">
      {SUPPORTED_LANGUAGES.map((language) => {
        const nativeName = LANGUAGE_NATIVE_NAMES[language];
        const isSelected = language === selectedLanguage;
        const fontClass = LABEL_CLASS_BY_FAMILY[getLanguageFontFamilyKey(language)];

        return (
          <PressableScale
            key={language}
            testID={`auth-language-${language}`}
            accessibilityLabel={nativeName}
            accessibilityRole="radio"
            isSelected={isSelected}
            onPress={() => void onChoose(language)}
            haptic="selection"
            style={continuousCorners}
            className={isSelected ? SELECTED_ROW_CLASS : ROW_CLASS}
          >
            <Text
              accessibilityLanguage={language}
              className={`text-start text-lg font-medium text-neutral-900 ${fontClass}`}
            >
              {nativeName}
            </Text>
            {isSelected ? (
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                className="text-xl font-bold text-primary"
              >
                {String.fromCodePoint(0x2713)}
              </Text>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}
