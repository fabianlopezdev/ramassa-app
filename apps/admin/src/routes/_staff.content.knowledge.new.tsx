import { KnowledgeEditor } from '@/components/content/knowledge-editor';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchKnowledgeCategories } from '@ramassa/shared/knowledge';

export const Route = createFileRoute('/_staff/content/knowledge/new')({
  ssr: false,
  loader: () => fetchKnowledgeCategories(supabase),
  component: NewKnowledgePage,
});

function NewKnowledgePage() {
  const { t } = useTranslation('knowledge');
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section>
      <Button asChild variant="link" className="m-4 mb-0">
        <Link to="/content/knowledge">{t('backToList')}</Link>
      </Button>
      <KnowledgeEditor
        categories={Route.useLoaderData()}
        onSaved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/knowledge' });
        }}
      />
    </section>
  );
}
