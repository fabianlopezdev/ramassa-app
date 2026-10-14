import { EventEditor } from '@/components/content/event-editor';
import { PreviewAsPlayer } from '@/components/content/preview-as-player';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { isContentVisible } from '@ramassa/shared/announcements';
import { fetchEvent, fetchEventCategories } from '@ramassa/shared/events';

export const Route = createFileRoute('/_staff/content/events/$eventId')({
  ssr: false,
  loader: async ({ params }) => {
    const [event, categories] = await Promise.all([
      fetchEvent(supabase, params.eventId),
      fetchEventCategories(supabase),
    ]);
    return { event, categories };
  },
  component: EditEventPage,
});

function EditEventPage() {
  const { event, categories } = Route.useLoaderData();
  const { t } = useTranslation('events');
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section>
      <div className="m-4 mb-0 flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="link">
          <Link to="/content/events">{t('backToList')}</Link>
        </Button>
        <PreviewAsPlayer
          target={`/event/${event.id}`}
          isVisibleToPlayers={isContentVisible({
            status: event.status,
            publishedAt: event.published_at,
            expiresAt: event.expires_at,
          })}
        />
      </div>
      <EventEditor
        event={event}
        categories={categories}
        onSaved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/events' });
        }}
      />
    </section>
  );
}
