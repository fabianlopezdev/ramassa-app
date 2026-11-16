/**
 * The participant invites as a screen of their own (RAPP-284). Since RAPP-798
 * the same panel is the Invitacions segment of Participants; this route stays
 * for existing links.
 */
import { PageWidth } from '@/components/layout/content-width';
import { PressableScale } from '@/components/motion/pressable-scale';
import { ParticipantInvitesPanel } from '@/components/participants/participant-invites-panel';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ParticipantInvitesScreen() {
  const { t } = useTranslation('participants');
  const { t: tCommon } = useTranslation('common');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className="gap-lg p-lg">
          <PressableScale
            testID="invites-back"
            accessibilityLabel={tCommon('back')}
            onPress={back}
            haptic="tapLight"
            className="min-h-recommended self-start justify-center"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {tCommon('back')}
            </Text>
          </PressableScale>
          <Text
            accessibilityRole="header"
            className={`text-start text-3xl font-bold text-neutral-900 ${fontClass}`}
          >
            {t('invitesTitle')}
          </Text>
          <ParticipantInvitesPanel />
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
