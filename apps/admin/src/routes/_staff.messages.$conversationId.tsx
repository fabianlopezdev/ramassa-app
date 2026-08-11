import { StaffConversationDetail } from '@/components/messaging/conversation-manager';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import {
  fetchConversation,
  fetchConversationAssignmentHistory,
  fetchConversationPeer,
} from '@ramassa/shared/messaging';

export const Route = createFileRoute('/_staff/messages/$conversationId')({
  ssr: false,
  loader: async ({ params }) => {
    const conversation = await fetchConversation(supabase, params.conversationId);
    const [peer, history] = await Promise.all([
      fetchConversationPeer(supabase, conversation.userId),
      fetchConversationAssignmentHistory(supabase, conversation.id),
    ]);
    return { conversation, peer, history };
  },
  component: StaffDirectConversation,
});

function StaffDirectConversation() {
  const { conversationId } = Route.useParams();
  const { conversation, peer, history } = Route.useLoaderData();
  return (
    <StaffConversationDetail
      conversationId={conversationId}
      conversation={conversation}
      peer={peer}
      history={history}
    />
  );
}
