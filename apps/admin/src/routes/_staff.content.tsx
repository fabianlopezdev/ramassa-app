import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_staff/content')({
  component: ContentLayout,
});

function ContentLayout() {
  const { t } = useTranslation(['announcements', 'events']);
  return (
    <>
      <nav aria-label={t('announcements:title')} className="flex gap-2 border-b px-6 py-3">
        <Link
          to="/content/announcements"
          className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
          activeProps={{ className: 'bg-muted' }}
        >
          {t('announcements:title')}
        </Link>
        <Link
          to="/content/events"
          className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
          activeProps={{ className: 'bg-muted' }}
        >
          {t('events:title')}
        </Link>
      </nav>
      <Outlet />
    </>
  );
}
