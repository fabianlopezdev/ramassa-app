import { AnnouncementEditor } from '@/components/content/announcement-editor';
import { Button } from '@/components/ui/button';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_staff/content/announcements/new')({
  ssr: false,
  component: NewAnnouncementPage,
});

function NewAnnouncementPage() {
  const { t } = useTranslation('announcements');
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section>
      <Button asChild variant="link" className="m-4 mb-0">
        <Link to="/content/announcements">{t('backToList')}</Link>
      </Button>
      <AnnouncementEditor
        onSaved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/announcements' });
        }}
      />
    </section>
  );
}
