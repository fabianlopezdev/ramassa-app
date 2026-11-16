/**
 * Participants' open deletion requests as a screen of their own (RAPP-286).
 * Since RAPP-798 the same panel is the Peticions d'esborrat segment of
 * Participants; this route stays for existing links.
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { DeletionRequestsPanel } from '@/components/participants/deletion-requests-panel';
import { participantCardHref } from '@/lib/participant-segments';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DeletionRequestsScreen() {
  const { t } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back, push } = useRouter();
  const openParticipant = useCallback((id: string) => push(participantCardHref(id)), [push]);

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="deletion-requests-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <View className="gap-xs">
            <Text
              accessibilityRole="header"
              className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
            >
              {t('deletionRequestsTitle')}
            </Text>
            <Text className={`text-start text-md text-neutral-600 ${fontClass}`}>
              {t('deletionRequestsHint')}
            </Text>
          </View>
          <DeletionRequestsPanel onOpenParticipant={openParticipant} />
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
