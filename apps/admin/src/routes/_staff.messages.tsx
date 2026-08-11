import { StaffConversationManager } from '@/components/messaging/conversation-manager';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import {
  adminConversationSearchSchema,
  fetchConversationStaff,
  fetchStaffConversations,
} from '@ramassa/shared/messaging';

export const Route = createFileRoute('/_staff/messages')({
  ssr: false,
  validateSearch: adminConversationSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [conversations, staff] = await Promise.all([
      fetchStaffConversations(supabase, deps),
      fetchConversationStaff(supabase),
    ]);
    return { conversations, staff };
  },
  component: StaffMessagesLayout,
});

function StaffMessagesLayout() {
  return <StaffConversationManager detail={<Outlet />} />;
}
