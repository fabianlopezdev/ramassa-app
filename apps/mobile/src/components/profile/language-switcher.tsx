/**
 * The real language switcher (RAPP-22, feature 14), replacing the dev-menu one
 * as the way a participant changes her language.
 *
 * The honest part is the restart. React Native applies a layout-direction flip
 * on the NEXT app start only, so switching between a left-to-right and a
 * right-to-left language leaves the app in a split state: the text is already
 * Arabic, the layout is still mirrored the old way. Rather than pretend
 * otherwise, this asks to restart, and asks ONLY when the direction actually
 * changed: ca/es/en between themselves, or ar/fa between themselves, need
 * nothing and get no prompt.
 *
 * The chips carry each language's name in its OWN script (Català, العربية),
 * never translated, because a woman looking for her language recognizes it
 * written the way she writes it and cannot be expected to first find it under
 * a name in a language she does not read.
 */

import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { reloadAppAsync } from 'expo';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Text, View } from 'react-native';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  useLanguage,
} from '@ramassa/shared/i18n';

export function LanguageSwitcher() {
  const { t } = useTranslation('profile');
  const languageFontClass = useLanguageFontClass();
  const { language, setLanguage } = useLanguage();
  const [needsRestart, setNeedsRestart] = useState(false);

  async function choose(next: (typeof SUPPORTED_LANGUAGES)[number]) {
    // Compared against the NATIVE direction, not the previous language's:
    // someone who already switched and postponed the restart is still on the
    // old layout, and the prompt has to keep reflecting that.
    const flipsDirection = I18nManager.isRTL !== (getLanguageDirection(next) === 'rtl');
    await setLanguage(next);
    setNeedsRestart(flipsDirection);
  }

  return (
    <View className="gap-sm">
      <Text className={`text-start text-md font-medium text-neutral-800 ${languageFontClass}`}>
        {t('languageLabel')}
      </Text>

      <View className="flex-row flex-wrap gap-sm">
        {SUPPORTED_LANGUAGES.map((code) => (
          <OptionChip
            key={code}
            label={LANGUAGE_NATIVE_NAMES[code]}
            isSelected={code === language}
            onPress={() => void choose(code)}
          />
        ))}
      </View>

      {needsRestart ? (
        <View
          accessibilityLiveRegion="polite"
          style={continuousCorners}
          className="gap-sm rounded-md bg-neutral-50 p-md"
        >
          <Text className={`text-start text-md font-medium text-neutral-900 ${languageFontClass}`}>
            {t('languageRestartTitle')}
          </Text>
          <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
            {t('languageRestartBody')}
          </Text>
          <View className="flex-row flex-wrap gap-sm">
            <PressableScale
              accessibilityLabel={t('languageRestartAction')}
              onPress={() => void reloadAppAsync()}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-md font-medium text-white ${languageFontClass}`}>
                {t('languageRestartAction')}
              </Text>
            </PressableScale>
            {/* Postponing is a real choice, not a nag to dismiss: the app is
                perfectly usable with the text already switched. */}
            <PressableScale
              accessibilityLabel={t('languageRestartLater')}
              onPress={() => setNeedsRestart(false)}
              haptic="selection"
              className="min-h-recommended justify-center px-lg"
            >
              <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
                {t('languageRestartLater')}
              </Text>
            </PressableScale>
          </View>
        </View>
      ) : null}
    </View>
  );
}
