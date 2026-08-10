import { ServiceReviewQueue } from '@/components/content/service-review-queue';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import {
  fetchServiceCategories,
  fetchServiceReviewQueue,
  serviceReviewSearchSchema,
} from '@ramassa/shared/services';

export const Route = createFileRoute('/_staff/content/services/reviews/')({
  ssr: false,
  validateSearch: serviceReviewSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [page, categories] = await Promise.all([
      fetchServiceReviewQueue(supabase, deps),
      fetchServiceCategories(supabase),
    ]);
    return { page, categories };
  },
  component: ServiceReviewsPage,
});

function ServiceReviewsPage() {
  const { page, categories } = Route.useLoaderData();
  return <ServiceReviewQueue page={page} search={Route.useSearch()} categories={categories} />;
}
