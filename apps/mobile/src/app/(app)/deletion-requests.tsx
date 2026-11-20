/**
 * Participants' open deletion requests as a screen of their own (RAPP-286).
 * Since RAPP-798 the same panel is the Peticions d'esborrat segment of
 * Participants; this route stays for existing links.
 */
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { screenContentClassName } from '@/components/layout/screen-spacing';
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
  const fontClass = useLanguageFontClass();
  const { push } = useRouter();
  const openParticipant = useCallback((id: string) => push(participantCardHref(id)), [push]);

  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['left', 'right']}>
      <NativeScreenHeader title={t('deletionRequestsTitle')} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className={screenContentClassName}>
          <View className="gap-xs">
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
