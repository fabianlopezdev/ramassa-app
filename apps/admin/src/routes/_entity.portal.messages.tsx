import { EntityWebMessageThread } from '@/components/messaging/web-message-thread';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_entity/portal/messages')({
  ssr: false,
  component: EntityWebMessageThread,
});
