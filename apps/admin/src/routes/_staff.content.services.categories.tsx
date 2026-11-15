import { ServiceCategoryManager } from '@/components/content/service-category-manager';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchServiceCategories } from '@ramassa/shared/services';

export const Route = createFileRoute('/_staff/content/services/categories')({
  ssr: false,
  loader: () => fetchServiceCategories(supabase),
  component: ServiceCategoriesPage,
});

function ServiceCategoriesPage() {
  const { t } = useTranslation('services');
  return (
    <section>
      <Button asChild variant="link" className="mx-4 mt-4 sm:mx-6 sm:mt-6">
        <Link to="/content/services">{t('backToList')}</Link>
      </Button>
      <ServiceCategoryManager initialCategories={Route.useLoaderData()} />
    </section>
  );
}
