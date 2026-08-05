import { AnnouncementEditor } from '@/components/content/announcement-editor';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchAnnouncement } from '@ramassa/shared/announcements';

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
      <Button asChild variant="link" className="m-4 mb-0">
        <Link to="/content/announcements">{t('backToList')}</Link>
      </Button>
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
