import { StaffFeedbackInbox } from '@/components/feedback/staff-feedback-inbox';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import {
  fetchFeedbackMonthlyCounts,
  fetchStaffFeedbackSubmissions,
} from '@ramassa/shared/feedback';

export const Route = createFileRoute('/_staff/feedback')({
  ssr: false,
  loader: async ({ abortController }) => {
    const [submissions, monthlyCounts] = await Promise.all([
      fetchStaffFeedbackSubmissions(supabase, {}, abortController.signal),
      fetchFeedbackMonthlyCounts(supabase, abortController.signal),
    ]);
    return { submissions, monthlyCounts };
  },
  component: StaffFeedbackPage,
});

function StaffFeedbackPage() {
  const { submissions, monthlyCounts } = Route.useLoaderData();
  return <StaffFeedbackInbox submissions={submissions} monthlyCounts={monthlyCounts} />;
}
