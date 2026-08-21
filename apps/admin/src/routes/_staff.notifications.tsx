import { NotificationWorkspace } from '@/components/notifications/notification-workspace';
import { supabase } from '@/lib/supabase';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import {
  fetchCustomNotificationGroups,
  fetchNotificationAudienceOptions,
  fetchNotificationSendHistory,
  fetchNotificationTemplates,
} from '@ramassa/shared/notifications';

export const Route = createFileRoute('/_staff/notifications')({
  ssr: false,
  loader: async ({ abortController }) => {
    const [templates, groups, history, options] = await Promise.all([
      fetchNotificationTemplates(supabase, abortController.signal),
      fetchCustomNotificationGroups(supabase, abortController.signal),
      fetchNotificationSendHistory(supabase, abortController.signal),
      fetchNotificationAudienceOptions(supabase, abortController.signal),
    ]);
    return { templates, groups, history, options };
  },
  component: StaffNotificationsPage,
});

function StaffNotificationsPage() {
  const router = useRouter();
  const data = Route.useLoaderData();
  return <NotificationWorkspace {...data} onRefresh={() => router.invalidate()} />;
}
