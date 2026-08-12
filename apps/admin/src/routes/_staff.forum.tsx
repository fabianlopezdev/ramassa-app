import { ForumModeration } from '@/components/forum/forum-moderation';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchForumCategories, fetchForumModerationQueue } from '@ramassa/shared/forum';

export const Route = createFileRoute('/_staff/forum')({
  ssr: false,
  loader: async () => {
    const [queue, categories] = await Promise.all([
      fetchForumModerationQueue(supabase),
      fetchForumCategories(supabase),
    ]);
    return { queue, categories };
  },
  component: StaffForumModerationPage,
});

function StaffForumModerationPage() {
  const { queue, categories } = Route.useLoaderData();
  return <ForumModeration queue={queue} categories={categories} />;
}
