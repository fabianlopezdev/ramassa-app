/**
 * The player preview of an unsaved draft (RAPP-373): the editor's values drawn
 * with the player's own component, in a language chosen here. Nothing is
 * saved and nobody else sees it.
 *
 * The chosen language applies inside the preview only: it gets its own
 * translation instance, which never changes or stores the app's language, and
 * Arabic and Farsi lay out right to left inside it with no restart.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { useOrganizationBranding } from '@/components/branding/organization-branding-provider';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { i18n } from '@/lib/i18n';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getLanguageDirection,
  isSupportedLanguage,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

/** Draws its children as a player reading in `language` would see them. */
function PlayerLanguageScope({
  language,
  children,
}: {
  readonly language: SupportedLanguage;
  readonly children: ReactNode;
}) {
  const scoped = useMemo(() => i18n.cloneInstance({ lng: language }), [language]);
  const direction = getLanguageDirection(language);
  return (
    <I18nextProvider i18n={scoped}>
      <View testID={`draft-preview-content-${language}`} style={{ direction }}>
        {children}
      </View>
    </I18nextProvider>
  );
}

export function DraftPreviewSheet({
  visible,
  onClose,
  isMissing,
  children,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** True when the draft has no text of its own in this language yet. */
  readonly isMissing: (language: SupportedLanguage) => boolean;
  readonly children: ReactNode;
}) {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  const organization = useOrganizationBranding();
  const languages = useMemo<readonly SupportedLanguage[]>(() => {
    const offered = (organization?.available_languages ?? []).filter(isSupportedLanguage);
    return offered.length > 0 ? offered : SUPPORTED_LANGUAGES;
  }, [organization?.available_languages]);
  const [language, setLanguage] = useState<SupportedLanguage>('ca');

  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white" testID="draft-preview-sheet">
        <View className="gap-sm border-b border-neutral-300 bg-neutral-100 px-lg pb-sm pt-md">
          <View className="flex-row items-center justify-between gap-md">
            <Text
              accessibilityRole="header"
              className={`flex-1 text-start text-sm font-bold text-neutral-900 ${fontClass}`}
            >
              {t('previewDraftTitle')}
            </Text>
            <PressableScale
              testID="draft-preview-close"
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              onPress={onClose}
              haptic="tapLight"
              className="min-h-recommended justify-center rounded-full bg-primary px-lg"
            >
              <Text className={`text-md font-semibold text-white ${fontClass}`}>{t('close')}</Text>
            </PressableScale>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-sm">
              {languages.map((candidate) => (
                <ChoiceOption
                  key={candidate}
                  testID={`draft-preview-language-${candidate}`}
                  value={candidate}
                  label={LANGUAGE_NATIVE_NAMES[candidate]}
                  selected={candidate === language}
                  onSelect={setLanguage}
                  languageFontClass={fontClass}
                />
              ))}
            </View>
          </ScrollView>
          {isMissing(language) ? (
            <Text
              testID="draft-preview-missing"
              accessibilityLiveRegion="polite"
              className={`text-start text-sm text-neutral-700 ${fontClass}`}
            >
              {t('previewDraftMissing')}
            </Text>
          ) : null}
        </View>
        <ScrollView className="flex-1" contentContainerClassName="px-lg py-lg">
          {visible ? (
            <PlayerLanguageScope language={language}>{children}</PlayerLanguageScope>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
