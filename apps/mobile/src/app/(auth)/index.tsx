import { LanguageChoiceList } from '@/components/auth/language-choice-list';
import { useLanguageRestart } from '@/components/auth/use-language-restart';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { hasPersistedLanguageChoice } from '@/lib/i18n';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage, type SupportedLanguage } from '@ramassa/shared/i18n';

export default function PreAuthLanguageScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const languageFontClass = useLanguageFontClass();
  const { language, setLanguage } = useLanguage();
  const [hadPersistedChoice] = useState(hasPersistedLanguageChoice);
  const { choose, dismissRestart, needsRestart, restart } = useLanguageRestart(setLanguage);

  async function chooseAndContinue(nextLanguage: SupportedLanguage) {
    const directionChanges = await choose(nextLanguage);
    if (!directionChanges) router.push('/login');
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="grow justify-center p-lg"
      >
        <FormWidth className="gap-xl">
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-primary ${languageFontClass}`}
            >
              {t('common:appName')}
            </Text>
            <Text
              accessibilityRole="header"
              className={`text-start text-2xl font-bold text-neutral-900 ${languageFontClass}`}
            >
              {t('auth:languageTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${languageFontClass}`}>
              {t('auth:languageSubtitle')}
            </Text>
          </View>

          <LanguageChoiceList selectedLanguage={language} onChoose={chooseAndContinue} />

          {needsRestart ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={continuousCorners}
              className="gap-sm rounded-md bg-neutral-50 p-md"
            >
              <Text
                className={`text-start text-md font-medium text-neutral-900 ${languageFontClass}`}
              >
                {t('auth:languageRestartTitle')}
              </Text>
              <Text className={`text-start text-sm text-neutral-600 ${languageFontClass}`}>
                {t('auth:languageRestartBody')}
              </Text>
              <View className="gap-sm">
                <PressableScale
                  accessibilityLabel={t('auth:languageRestartAction')}
                  onPress={() => void restart()}
                  haptic="tapLight"
                  style={continuousCorners}
                  className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
                >
                  <Text className={`text-md font-bold text-white ${languageFontClass}`}>
                    {t('auth:languageRestartAction')}
                  </Text>
                </PressableScale>
                <PressableScale
                  accessibilityLabel={t('auth:languageRestartLater')}
                  onPress={dismissRestart}
                  haptic="selection"
                  className="min-h-min items-center justify-center py-sm"
                >
                  <Text className={`text-md font-medium text-primary ${languageFontClass}`}>
                    {t('auth:languageRestartLater')}
                  </Text>
                </PressableScale>
              </View>
            </View>
          ) : hadPersistedChoice ? (
            <PressableScale
              accessibilityLabel={t('auth:continueAction')}
              onPress={() => router.push('/login')}
              haptic="tapLight"
              style={continuousCorners}
              className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
            >
              <Text className={`text-md font-bold text-white ${languageFontClass}`}>
                {t('auth:continueAction')}
              </Text>
            </PressableScale>
          ) : null}
        </FormWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
