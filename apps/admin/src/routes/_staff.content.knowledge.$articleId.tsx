import { KnowledgeEditor } from '@/components/content/knowledge-editor';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fetchKnowledgeArticle, fetchKnowledgeCategories } from '@ramassa/shared/knowledge';

export const Route = createFileRoute('/_staff/content/knowledge/$articleId')({
  ssr: false,
  loader: ({ params }) =>
    Promise.all([
      fetchKnowledgeArticle(supabase, params.articleId),
      fetchKnowledgeCategories(supabase),
    ]),
  component: EditKnowledgePage,
});

function EditKnowledgePage() {
  const [article, categories] = Route.useLoaderData();
  const { t } = useTranslation('knowledge');
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section>
      <Button asChild variant="link" className="m-4 mb-0">
        <Link to="/content/knowledge">{t('backToList')}</Link>
      </Button>
      <KnowledgeEditor
        article={article}
        categories={categories}
        onSaved={async () => {
          await router.invalidate({ sync: true });
          await navigate({ to: '/content/knowledge' });
        }}
      />
    </section>
  );
}
