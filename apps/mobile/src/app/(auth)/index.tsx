import { LanguageChoiceHeading } from '@/components/auth/language-choice-heading';
import { LanguageChoiceList } from '@/components/auth/language-choice-list';
import { shouldRestartForLanguage } from '@/components/auth/language-restart-policy';
import { PublicOrganizationLogo } from '@/components/branding/public-organization-logo';
import { FormWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { LANGUAGE_CONFIRMED_RELOAD_KEY } from '@/lib/language-confirmation';
import { preferencesStorage } from '@/lib/storage';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { reloadAppAsync } from 'expo';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

export default function PreAuthLanguageScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const languageFontClass = useLanguageFontClass();
  const { language, setLanguage } = useLanguage();
  const [continuing, setContinuing] = useState(false);
  const { fontScale } = useWindowDimensions();
  const continueStyle = useMemo(
    () => ({ ...continuousCorners, height: tokens.tapTarget.recommended * Math.max(1, fontScale) }),
    [fontScale],
  );

  async function continueToLogin() {
    if (continuing) return;
    setContinuing(true);
    // Persist the default choice too, even if the user never tapped a row.
    await setLanguage(language);
    if (Platform.OS !== 'web' && shouldRestartForLanguage(I18nManager.isRTL, language)) {
      preferencesStorage.set(LANGUAGE_CONFIRMED_RELOAD_KEY, true);
      try {
        await reloadAppAsync();
        return;
      } catch {
        // Entry remains available if this runtime cannot reload.
        preferencesStorage.remove(LANGUAGE_CONFIRMED_RELOAD_KEY);
      }
    }
    setContinuing(false);
    router.push('/login');
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScrollView
        testID="language-scroll-content"
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="grow justify-center p-lg"
      >
        <FormWidth className="gap-lg">
          <PublicOrganizationLogo />
          <LanguageChoiceHeading />
          <LanguageChoiceList selectedLanguage={language} onChoose={setLanguage} />
        </FormWidth>
      </ScrollView>
      <View testID="language-continue-footer" className="p-lg pt-md">
        <FormWidth>
          <PressableScale
            accessibilityLabel={t('auth:continueAction')}
            onPress={() => void continueToLogin()}
            isBusy={continuing}
            isDisabled={continuing}
            haptic="tapLight"
            style={continueStyle}
            className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
          >
            <Text className={`text-md font-bold text-white ${languageFontClass}`}>
              {t('auth:continueAction')}
            </Text>
          </PressableScale>
        </FormWidth>
      </View>
    </SafeAreaView>
  );
}
