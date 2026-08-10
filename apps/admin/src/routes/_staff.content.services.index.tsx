import { ServicesTable } from '@/components/content/services-table';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import {
  fetchAdminServices,
  fetchServiceCategories,
  serviceSearchSchema,
} from '@ramassa/shared/services';

export const Route = createFileRoute('/_staff/content/services/')({
  ssr: false,
  validateSearch: serviceSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [page, categories] = await Promise.all([
      fetchAdminServices(supabase, deps),
      fetchServiceCategories(supabase),
    ]);
    return { page, categories };
  },
  component: ServicesPage,
});

function ServicesPage() {
  const { page, categories } = Route.useLoaderData();
  return <ServicesTable page={page} search={Route.useSearch()} categories={categories} />;
}
