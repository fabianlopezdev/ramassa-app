/**
 * The frame of the player preview (RAPP-371, ADR-027): a bar above the player
 * app says it is the player view and that no change is saved, offers the
 * organization's languages, and leaves the preview. The app below gets no top
 * inset, because the bar already takes it.
 *
 * When the preview opens from an item, the bar opens that item's player screen
 * once the player area has mounted.
 */
import { useOrganizationBranding } from '@/components/branding/organization-branding-provider';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { PressableScale } from '@/components/motion/pressable-scale';
import { choosePreviewLanguage, leavePreview } from '@/lib/player-preview';
import { previewMode } from '@/lib/supabase';
import { useAccountAccess } from '@/lib/use-account-access';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  isSupportedLanguage,
  LANGUAGE_NATIVE_NAMES,
  SUPPORTED_LANGUAGES,
  useLanguage,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';

function PlayerPreviewBar({ topInset }: { readonly topInset: number }) {
  const { t } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { language } = useLanguage();
  const organization = useOrganizationBranding();
  const { area } = useAccountAccess();
  const { push } = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);
  const languages = useMemo<readonly SupportedLanguage[]>(() => {
    const offered = (organization?.available_languages ?? []).filter(isSupportedLanguage);
    return offered.length > 0 ? offered : SUPPORTED_LANGUAGES;
  }, [organization?.available_languages]);

  useEffect(() => {
    if (area !== 'player') return;
    const target = previewMode.takeTarget();
    if (target !== null) push(target as Href);
  }, [area, push]);

  return (
    <View
      testID="player-preview-bar"
      style={{ paddingTop: topInset }}
      className="gap-sm border-b border-neutral-300 bg-neutral-100 px-lg pb-sm"
    >
      <View className="flex-row items-center justify-between gap-md pt-sm">
        <Text
          accessibilityRole="header"
          className={`flex-1 text-start text-sm font-bold text-neutral-900 ${fontClass}`}
        >
          {t('previewBarTitle')}
        </Text>
        <PressableScale
          testID="player-preview-exit"
          accessibilityRole="button"
          accessibilityLabel={t('previewExit')}
          isBusy={isLeaving}
          onPress={() => {
            setIsLeaving(true);
            void leavePreview();
          }}
          haptic="tapLight"
          className="min-h-recommended justify-center rounded-full bg-primary px-lg"
        >
          <Text className={`text-md font-semibold text-white ${fontClass}`}>
            {t('previewExit')}
          </Text>
        </PressableScale>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={t('previewLanguage')}
      >
        <View className="flex-row gap-sm">
          {languages.map((candidate) => (
            <ChoiceOption
              key={candidate}
              testID={`player-preview-language-${candidate}`}
              value={candidate}
              label={LANGUAGE_NATIVE_NAMES[candidate]}
              selected={candidate === language}
              onSelect={(next) => void choosePreviewLanguage(next)}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function PlayerPreviewFrame({ children }: { readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const below = useMemo(() => ({ ...insets, top: 0 }), [insets]);
  return (
    <View className="flex-1 bg-neutral-100">
      <PlayerPreviewBar topInset={insets.top} />
      <SafeAreaInsetsContext.Provider value={below}>
        <View className="flex-1 bg-white">{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
