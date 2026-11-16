import { ServiceReviewDetail } from '@/components/content/service-review-detail';
import { NativeScreenHeader } from '@/components/layout/native-screen-header';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/** One item of the service review queue, on a phone (RAPP-345). */
export default function ContentServiceReviewScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['left', 'right']}>
      <NativeScreenHeader />
      <ServiceReviewDetail reviewKey={decodeURIComponent(id)} onDone={back} />
    </SafeAreaView>
  );
}
