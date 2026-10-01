import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import {
  getLanguageFontFamilyKey,
  SUPPORTED_LANGUAGES,
  useLanguage,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const fontClasses = { sans: 'font-sans', arabic: 'font-arabic', farsi: 'font-farsi' } as const;
const visibleTitleStyle = { position: 'absolute', width: '100%', opacity: 1 } as const;
const hiddenTitleStyle = { ...visibleTitleStyle, opacity: 0 } as const;

export function LanguageChoiceHeading() {
  const { t } = useTranslation('auth');
  const { language } = useLanguage();
  const { fontScale } = useWindowDimensions();
  const [heights, setHeights] = useState<Partial<Record<SupportedLanguage, number>>>({});
  const containerStyle = useMemo(
    () => ({
      height: Math.max(
        tokens.onboarding.languageHeadingMinHeight * Math.max(1, fontScale),
        ...Object.values(heights),
      ),
      justifyContent: 'center' as const,
    }),
    [fontScale, heights],
  );

  return (
    <View testID="language-heading" style={containerStyle}>
      {/* Measure every translation in its own font before it is selected. The
          tallest wrapped title owns the slot, so switching only changes opacity. */}
      {SUPPORTED_LANGUAGES.map((titleLanguage) => {
        const active = titleLanguage === language;
        return (
          <Text
            key={titleLanguage}
            accessibilityRole="header"
            accessibilityLanguage={titleLanguage}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            pointerEvents="none"
            style={active ? visibleTitleStyle : hiddenTitleStyle}
            className={`text-center text-2xl font-bold text-neutral-900 ${fontClasses[getLanguageFontFamilyKey(titleLanguage)]}`}
            onLayout={({ nativeEvent: { layout } }) => {
              const height = Math.ceil(layout.height);
              setHeights((previous) =>
                previous[titleLanguage] === height
                  ? previous
                  : { ...previous, [titleLanguage]: height },
              );
            }}
          >
            {t('languageTitle', { lng: titleLanguage })}
          </Text>
        );
      })}
    </View>
  );
}
