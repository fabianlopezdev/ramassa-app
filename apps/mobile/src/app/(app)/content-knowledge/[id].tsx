import { KnowledgeDetail } from '@/components/content/knowledge-detail';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/** One knowledge resource for the team, on a phone (RAPP-343). */
export default function ContentKnowledgeScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { back } = useRouter();
  return (
    <SafeAreaView className="flex-1 bg-neutral-50" edges={['top', 'left', 'right']}>
      <KnowledgeDetail articleId={id} onBack={back} onDeleted={back} />
    </SafeAreaView>
  );
}
