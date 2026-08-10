import { EntityServiceEditor } from '@/components/entity/entity-service-editor';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchServiceCategories } from '@ramassa/shared/services';
import { fetchOwnServiceContacts } from '@ramassa/shared/services/entity';

export const Route = createFileRoute('/_entity/portal/services/new')({
  ssr: false,
  loader: async () => {
    const [categories, contacts] = await Promise.all([
      fetchServiceCategories(supabase),
      fetchOwnServiceContacts(supabase),
    ]);
    return { categories, contacts };
  },
  component: NewEntityServicePage,
});

function NewEntityServicePage() {
  const { t } = useTranslation('entity-services');
  const { categories, contacts } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6 p-6">
      <Button asChild variant="link" className="w-fit px-0">
        <Link to="/portal/services">{t('backToList')}</Link>
      </Button>
      <header>
        <h1 className="text-2xl font-semibold">{t('newTitle')}</h1>
      </header>
      <EntityServiceEditor
        categories={categories}
        contacts={contacts}
        onSaved={async (serviceId) => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/portal/services/$serviceId', params: { serviceId } });
        }}
      />
    </section>
  );
}
