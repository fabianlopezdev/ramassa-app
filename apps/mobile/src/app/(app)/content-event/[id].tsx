import { EventDetail } from '@/components/content/event-detail';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/** One event for the team, on a phone (RAPP-342). */
export default function ContentEventScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['left', 'right']}>
      <NativeScreenHeader />
      <EventDetail eventId={id} onDeleted={back} />
    </SafeAreaView>
  );
}
