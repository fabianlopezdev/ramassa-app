import { EntityServiceDashboard } from '@/components/entity/entity-service-dashboard';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchServiceCategories } from '@ramassa/shared/services';
import { fetchEntityServiceSubmissions } from '@ramassa/shared/services/entity';

export const Route = createFileRoute('/_entity/portal/services/')({
  ssr: false,
  loader: async () => {
    const [services, categories] = await Promise.all([
      fetchEntityServiceSubmissions(supabase),
      fetchServiceCategories(supabase),
    ]);
    return { services, categories };
  },
  component: EntityServicesPage,
});

function EntityServicesPage() {
  const { services, categories } = Route.useLoaderData();
  return <EntityServiceDashboard initialServices={services} categories={categories} />;
}
