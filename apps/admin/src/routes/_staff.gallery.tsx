import { GalleryModeration } from '@/components/gallery/gallery-moderation';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchMediaItems } from '@ramassa/shared/media';

export const Route = createFileRoute('/_staff/gallery')({
  ssr: false,
  loader: async ({ abortController }) => ({
    items: await fetchMediaItems(supabase, { signal: abortController.signal }),
  }),
  component: StaffGalleryPage,
});

function StaffGalleryPage() {
  const { items } = Route.useLoaderData();
  return <GalleryModeration items={items} />;
}
