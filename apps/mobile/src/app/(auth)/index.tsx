import { LanguageChoiceHeading } from '@/components/auth/language-choice-heading';
import { LanguageChoiceList } from '@/components/auth/language-choice-list';
import { shouldRestartForLanguage } from '@/components/auth/language-restart-policy';
import { PublicOrganizationLogo } from '@/components/branding/public-organization-logo';
import { FormWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { LANGUAGE_CONFIRMED_RELOAD_KEY } from '@/lib/language-confirmation';
import { preferencesStorage } from '@/lib/storage';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { reloadAppAsync } from 'expo';
import { BlurTargetView, BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const scrollViewportStyle = { flex: 1, overflow: 'hidden' } as const;
const blurFillStyle = { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 } as const;

export default function PreAuthLanguageScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const languageFontClass = useLanguageFontClass();
  const { language, setLanguage } = useLanguage();
  const [continuing, setContinuing] = useState(false);
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const bottomPadding = tokens.spacing.lg + insets.bottom;
  const estimatedFooterHeight =
    tokens.tapTarget.recommended * Math.max(1, fontScale) + tokens.spacing.md + bottomPadding;
  const scrollContentStyle = useMemo(
    () => ({
      // The initial content clears the status icons, but the viewport extends
      // behind them so scrolling does not reveal an opaque safe-area strip.
      paddingTop: insets.top + tokens.spacing.lg,
      paddingBottom: Math.max(footerHeight, estimatedFooterHeight) + tokens.spacing.lg,
    }),
    [insets.top, footerHeight, estimatedFooterHeight],
  );
  const footerStyle = useMemo(() => ({ paddingBottom: bottomPadding }), [bottomPadding]);
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
    <SafeAreaView className="flex-1 bg-white" edges={['left', 'right']}>
      <BlurTargetView
        ref={blurTarget}
        testID="language-scroll-viewport"
        style={scrollViewportStyle}
      >
        <ScrollView
          testID="language-scroll-content"
          className="flex-1"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerClassName="grow justify-center p-lg"
          contentContainerStyle={scrollContentStyle}
        >
          <FormWidth className="gap-lg">
            <PublicOrganizationLogo />
            <FadeSlideIn preset="fade">
              <LanguageChoiceHeading />
            </FadeSlideIn>
            <LanguageChoiceList selectedLanguage={language} onChoose={setLanguage} />
          </FormWidth>
        </ScrollView>
      </BlurTargetView>
      <View
        testID="language-continue-footer"
        className="absolute bottom-0 start-0 end-0 overflow-hidden px-lg pt-md"
        style={footerStyle}
        onLayout={({ nativeEvent: { layout } }) => setFooterHeight(layout.height)}
      >
        <BlurView
          pointerEvents="none"
          style={blurFillStyle}
          tint="light"
          intensity={tokens.onboarding.footerBlurIntensity}
          blurTarget={blurTarget}
          blurMethod="dimezisBlurViewSdk31Plus"
        />
        <FormWidth>
          <FadeSlideIn preset="fade">
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
          </FadeSlideIn>
        </FormWidth>
      </View>
    </SafeAreaView>
  );
}
