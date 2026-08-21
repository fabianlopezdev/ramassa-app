import { SurveyWorkspace } from '@/components/surveys/survey-workspace';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import {
  fetchCustomNotificationGroups,
  fetchNotificationAudienceOptions,
} from '@ramassa/shared/notifications';
import { fetchStaffSurveys } from '@ramassa/shared/surveys';

export const Route = createFileRoute('/_staff/surveys')({
  ssr: false,
  loader: async ({ abortController }) => {
    const [surveys, groups, options] = await Promise.all([
      fetchStaffSurveys(supabase, abortController.signal),
      fetchCustomNotificationGroups(supabase, abortController.signal),
      fetchNotificationAudienceOptions(supabase, abortController.signal),
    ]);
    return { surveys, groups, options };
  },
  component: StaffSurveysPage,
});

function StaffSurveysPage() {
  const router = useRouter();
  const data = Route.useLoaderData();
  return <SurveyWorkspace {...data} onRefresh={() => router.invalidate()} />;
}
