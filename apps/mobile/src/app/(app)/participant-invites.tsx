/**
 * The participant invites as a screen of their own (RAPP-284). Since RAPP-798
 * the same panel is the Invitacions segment of Participants; this route stays
 * for existing links.
 */
import { PageWidth } from '@/components/layout/content-width';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { screenContentClassName } from '@/components/layout/screen-spacing';
import { ParticipantInvitesPanel } from '@/components/participants/participant-invites-panel';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ParticipantInvitesScreen() {
  const { t } = useTranslation('participants');
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['left', 'right']}>
      <NativeScreenHeader title={t('invitesTitle')} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-3xl">
        <PageWidth className={screenContentClassName}>
          <ParticipantInvitesPanel />
        </PageWidth>
      </ScrollView>
    </SafeAreaView>
  );
}
