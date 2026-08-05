import { EventEditor } from '@/components/content/event-editor';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchEventCategories } from '@ramassa/shared/events';

export const Route = createFileRoute('/_staff/content/events/new')({
  ssr: false,
  loader: () => fetchEventCategories(supabase),
  component: NewEventPage,
});

function NewEventPage() {
  const categories = Route.useLoaderData();
  const { t } = useTranslation('events');
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section>
      <Button asChild variant="link" className="m-4 mb-0">
        <Link to="/content/events">{t('backToList')}</Link>
      </Button>
      <EventEditor
        categories={categories}
        onSaved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/events' });
        }}
      />
    </section>
  );
}
