import { EntityDashboard } from '@/components/entity/entity-dashboard';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchEntityUpcomingEvents } from '@ramassa/shared/entity-management';

export const Route = createFileRoute('/_entity/portal/events')({
  ssr: false,
  loader: () => fetchEntityUpcomingEvents(supabase),
  component: EventsPage,
});

function EventsPage() {
  return (
    <EntityDashboard
      dashboard={{
        impact: {
          suppressed: true,
          referredCount: null,
          activeCount: null,
          inactiveCount: null,
          attendancePresentCount: null,
          attendanceEligibleCount: null,
          attendanceMarkedCount: null,
          attendanceRate: null,
        },
        trend: [],
        tracking: [],
        upcomingEvents: Route.useLoaderData(),
      }}
      sections={['events']}
    />
  );
}
