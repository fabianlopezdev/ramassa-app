import { ServiceDetail } from '@/components/content/service-detail';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/** One service for the team, on a phone (RAPP-344). */
export default function ContentServiceScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['left', 'right']}>
      <NativeScreenHeader />
      <ServiceDetail serviceId={id} onDeleted={back} />
    </SafeAreaView>
  );
}
