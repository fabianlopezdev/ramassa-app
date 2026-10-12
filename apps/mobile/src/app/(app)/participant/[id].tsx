import { ParticipantCard } from '@/components/participants/participant-card';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ParticipantCardScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <ParticipantCard participantId={id} onBack={back} />
    </SafeAreaView>
  );
}
