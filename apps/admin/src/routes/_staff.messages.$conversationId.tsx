import { WebMessageThread } from '@/components/messaging/web-message-thread';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_staff/messages/$conversationId')({
  ssr: false,
  component: StaffDirectConversation,
});

function StaffDirectConversation() {
  const { conversationId } = Route.useParams();
  return <WebMessageThread conversationId={conversationId} titleKey="staffTitle" />;
}
