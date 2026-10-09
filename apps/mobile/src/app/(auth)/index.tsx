import { AuthActionFooter } from '@/components/auth/auth-action-footer';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { LanguageChoiceHeading } from '@/components/auth/language-choice-heading';
import { LanguageChoiceList } from '@/components/auth/language-choice-list';
import { shouldRestartForLanguage } from '@/components/auth/language-restart-policy';
import { PublicOrganizationLogo } from '@/components/branding/public-organization-logo';
import { FormWidth } from '@/components/layout/content-width';
import { FadeSlideIn } from '@/components/motion/fade-slide-in';
import { LANGUAGE_CONFIRMED_RELOAD_KEY } from '@/lib/language-confirmation';
import { preferencesStorage } from '@/lib/storage';
import { reloadAppAsync } from 'expo';
import { BlurTargetView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Platform, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@ramassa/shared/i18n';
import { tokens } from '@ramassa/shared/tokens';

const scrollViewportStyle = { flex: 1, overflow: 'hidden' } as const;

export default function PreAuthLanguageScreen() {
  const { t } = useTranslation(['auth', 'common']);
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const [continuing, setContinuing] = useState(false);
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const blurTarget = useRef<View | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const contentOverflows =
    viewportHeight > 0 && Math.round(contentHeight) > Math.round(viewportHeight);
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
    router.push('/email-login');
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
          onLayout={({ nativeEvent: { layout } }) => setViewportHeight(layout.height)}
          onContentSizeChange={(_width, height) => setContentHeight(height)}
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
      <AuthActionFooter
        testID="language-continue-footer"
        blurTarget={blurTarget}
        blurred={contentOverflows}
        onLayout={({ nativeEvent }) => setFooterHeight(nativeEvent.layout.height)}
      >
        <FadeSlideIn preset="fade">
          <AuthSubmitButton
            label={t('auth:continueAction')}
            onPress={() => void continueToLogin()}
            isLoading={continuing}
          />
        </FadeSlideIn>
      </AuthActionFooter>
    </SafeAreaView>
  );
}
