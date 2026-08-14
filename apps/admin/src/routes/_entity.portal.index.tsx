import { EntityDashboard } from '@/components/entity/entity-dashboard';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchEntityDashboard } from '@ramassa/shared/entity-management';

export const Route = createFileRoute('/_entity/portal/')({
  ssr: false,
  loader: () => fetchEntityDashboard(supabase),
  component: PortalPage,
});

function PortalPage() {
  return <EntityDashboard dashboard={Route.useLoaderData()} sections={['impact', 'tracking']} />;
}
