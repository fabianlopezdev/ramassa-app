import { StaffMentoringQueue } from '@/components/mentoring/staff-mentoring-queue';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchStaffMentoringRequests } from '@ramassa/shared/mentoring';
import { fetchConversationStaff } from '@ramassa/shared/messaging';

export const Route = createFileRoute('/_staff/mentoring')({
  ssr: false,
  loader: async ({ abortController }) => {
    const [requests, staff] = await Promise.all([
      fetchStaffMentoringRequests(supabase, abortController.signal),
      fetchConversationStaff(supabase, abortController.signal),
    ]);
    return { requests, staff };
  },
  component: StaffMentoringPage,
});

function StaffMentoringPage() {
  const { requests, staff } = Route.useLoaderData();
  return <StaffMentoringQueue requests={requests} staff={staff} />;
}
