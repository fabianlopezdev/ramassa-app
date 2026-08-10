import { ServiceEditor } from '@/components/content/service-editor';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchServiceCategories } from '@ramassa/shared/services';

export const Route = createFileRoute('/_staff/content/services/new')({
  ssr: false,
  loader: () => fetchServiceCategories(supabase),
  component: NewServicePage,
});

function NewServicePage() {
  const { t } = useTranslation('services');
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section>
      <Button asChild variant="link" className="m-4 mb-0">
        <Link to="/content/services">{t('backToList')}</Link>
      </Button>
      <ServiceEditor
        categories={Route.useLoaderData()}
        onSaved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/services' });
        }}
      />
    </section>
  );
}
