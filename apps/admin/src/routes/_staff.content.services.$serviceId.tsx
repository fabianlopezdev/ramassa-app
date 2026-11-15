import { PreviewAsPlayer } from '@/components/content/preview-as-player';
import { ServiceEditor } from '@/components/content/service-editor';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  fetchAdminService,
  fetchServiceCategories,
  getServiceLifecycle,
} from '@ramassa/shared/services';

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
      <div className="mx-4 mt-4 flex flex-wrap sm:mx-6 sm:mt-6 items-center justify-between gap-2">
        <Button asChild variant="link">
          <Link to="/content/services">{t('backToList')}</Link>
        </Button>
        <PreviewAsPlayer
          target={`/service/${detail.service.id}`}
          isVisibleToPlayers={
            getServiceLifecycle({
              status: detail.service.status,
              publishedAt: detail.service.published_at,
              expiresAt: detail.service.expires_at,
            }) === 'published'
          }
        />
      </div>
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
