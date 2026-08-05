import { AnnouncementsTable } from '@/components/content/announcements-table';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { announcementSearchSchema, fetchAnnouncements } from '@ramassa/shared/announcements';

export const Route = createFileRoute('/_staff/content/announcements/')({
  ssr: false,
  validateSearch: announcementSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchAnnouncements(supabase, deps),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  return <AnnouncementsTable page={Route.useLoaderData()} search={Route.useSearch()} />;
}
