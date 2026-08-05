import { EventsTable } from '@/components/content/events-table';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { eventSearchSchema, fetchEventCategories, fetchEvents } from '@ramassa/shared/events';

export const Route = createFileRoute('/_staff/content/events/')({
  ssr: false,
  validateSearch: eventSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [page, categories] = await Promise.all([
      fetchEvents(supabase, deps),
      fetchEventCategories(supabase),
    ]);
    return { page, categories };
  },
  component: EventsPage,
});

function EventsPage() {
  const { page, categories } = Route.useLoaderData();
  return <EventsTable page={page} categories={categories} search={Route.useSearch()} />;
}
