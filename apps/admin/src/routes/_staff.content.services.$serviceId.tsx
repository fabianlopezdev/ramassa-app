import { ServiceEditor } from '@/components/content/service-editor';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchAdminService, fetchServiceCategories } from '@ramassa/shared/services';

export const Route = createFileRoute('/_staff/content/services/$serviceId')({
  ssr: false,
  loader: async ({ params }) => {
    const [detail, categories] = await Promise.all([
      fetchAdminService(supabase, params.serviceId),
      fetchServiceCategories(supabase),
    ]);
    return { detail, categories };
  },
  component: EditServicePage,
});

function EditServicePage() {
  const { detail, categories } = Route.useLoaderData();
  const { t } = useTranslation('services');
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section>
      <Button asChild variant="link" className="m-4 mb-0">
        <Link to="/content/services">{t('backToList')}</Link>
      </Button>
      <ServiceEditor
        detail={detail}
        categories={categories}
        onSaved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/services' });
        }}
      />
    </section>
  );
}
