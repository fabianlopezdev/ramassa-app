/**
 * The guide categories screen (RAPP-869), next to the service categories one.
 * Only a team member who edits the knowledge base opens it; the database's
 * row rules hold the same line.
 */

import { RequireAuth } from '@/components/auth/require-auth';
import { GuideCategoryManager } from '@/components/content/guide-category-manager';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchKnowledgeCategories } from '@ramassa/shared/knowledge';
import type { PermissionCode } from '@ramassa/shared/permissions';

const GUIDE_CATEGORY_PERMISSIONS: readonly PermissionCode[] = ['knowledge.edit'];

export const Route = createFileRoute('/_staff/content/knowledge/categories')({
  ssr: false,
  loader: () => fetchKnowledgeCategories(supabase),
  component: GuideCategoriesPage,
});

function GuideCategoriesPage() {
  const { t } = useTranslation('knowledge');
  return (
    <RequireAuth allow={['staff', 'admin']} anyPermission={GUIDE_CATEGORY_PERMISSIONS}>
      <section>
        <Button asChild variant="link" className="mx-4 mt-4 sm:mx-6 sm:mt-6">
          <Link to="/content/knowledge">{t('backToList')}</Link>
        </Button>
        <GuideCategoryManager initialCategories={Route.useLoaderData()} />
      </section>
    </RequireAuth>
  );
}
