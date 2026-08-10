import { EntityServiceEditor } from '@/components/entity/entity-service-editor';
import { EntityServiceReadonly } from '@/components/entity/entity-service-readonly';
import { EntityServiceThread } from '@/components/entity/entity-service-thread';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchServiceCategories } from '@ramassa/shared/services';
import {
  fetchEntityService,
  fetchOwnServiceContacts,
  fetchServiceSubmissionComments,
  getEntityServiceActions,
} from '@ramassa/shared/services/entity';

export const Route = createFileRoute('/_entity/portal/services/$serviceId')({
  ssr: false,
  loader: async ({ params }) => {
    const [service, categories, contacts, comments] = await Promise.all([
      fetchEntityService(supabase, params.serviceId),
      fetchServiceCategories(supabase),
      fetchOwnServiceContacts(supabase),
      fetchServiceSubmissionComments(supabase, params.serviceId),
    ]);
    return { service, categories, contacts, comments };
  },
  component: EntityServicePage,
});

function EntityServicePage() {
  const { t } = useTranslation('entity-services');
  const { service, categories, contacts, comments } = Route.useLoaderData();
  const router = useRouter();
  const canEdit = getEntityServiceActions(service.status).includes('edit');
  return (
    <section className="mx-auto grid w-full max-w-4xl gap-6 p-6">
      <Button asChild variant="link" className="w-fit px-0">
        <Link to="/portal/services">{t('backToList')}</Link>
      </Button>
      {canEdit ? (
        <>
          <h1 className="text-2xl font-semibold">{t('editTitle')}</h1>
          <EntityServiceEditor
            categories={categories}
            contacts={contacts}
            service={service}
            onSaved={() => router.invalidate({ sync: true })}
          />
        </>
      ) : (
        <EntityServiceReadonly service={service} />
      )}
      <EntityServiceThread serviceId={service.id} initialComments={comments} />
    </section>
  );
}
