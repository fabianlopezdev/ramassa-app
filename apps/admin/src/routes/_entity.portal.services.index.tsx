import { EntityServiceDashboard } from '@/components/entity/entity-service-dashboard';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchServiceCategories } from '@ramassa/shared/services';
import {
  fetchEntityServiceDecisionNotifications,
  fetchEntityServiceSubmissions,
} from '@ramassa/shared/services/entity';

export const Route = createFileRoute('/_entity/portal/services/')({
  ssr: false,
  loader: async () => {
    const [services, categories, notifications] = await Promise.all([
      fetchEntityServiceSubmissions(supabase),
      fetchServiceCategories(supabase),
      fetchEntityServiceDecisionNotifications(supabase),
    ]);
    return { services, categories, notifications };
  },
  component: EntityServicesPage,
});

function EntityServicesPage() {
  const { services, categories, notifications } = Route.useLoaderData();
  return (
    <EntityServiceDashboard
      initialServices={services}
      categories={categories}
      notifications={notifications}
    />
  );
}
