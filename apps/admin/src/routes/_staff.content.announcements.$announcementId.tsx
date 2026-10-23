import { AnnouncementEditor } from '@/components/content/announcement-editor';
import { PreviewAsPlayer } from '@/components/content/preview-as-player';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchAnnouncement, isContentVisible } from '@ramassa/shared/announcements';

export const Route = createFileRoute('/_staff/content/announcements/$announcementId')({
  ssr: false,
  loader: ({ params }) => fetchAnnouncement(supabase, params.announcementId),
  component: EditAnnouncementPage,
});

function EditAnnouncementPage() {
  const announcement = Route.useLoaderData();
  const { t } = useTranslation('announcements');
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section>
      <div className="mx-4 mt-4 flex flex-wrap sm:mx-6 sm:mt-6 items-center justify-between gap-2">
        <Button asChild variant="link">
          <Link to="/content/announcements">{t('backToList')}</Link>
        </Button>
        <PreviewAsPlayer
          target={`/announcement/${announcement.id}`}
          isVisibleToPlayers={isContentVisible({
            status: announcement.status,
            publishedAt: announcement.published_at,
            expiresAt: announcement.expires_at,
          })}
        />
      </div>
      <AnnouncementEditor
        announcement={announcement}
        onSaved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/announcements' });
        }}
      />
    </section>
  );
}
