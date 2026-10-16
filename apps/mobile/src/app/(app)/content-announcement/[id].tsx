import { AnnouncementDetail } from '@/components/content/announcement-detail';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/** One announcement for the team, on a phone (RAPP-340). */
export default function ContentAnnouncementScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <AnnouncementDetail announcementId={id} onBack={back} onDeleted={back} />
    </SafeAreaView>
  );
}
