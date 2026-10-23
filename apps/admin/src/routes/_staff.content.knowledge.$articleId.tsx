import { KnowledgeEditor } from '@/components/content/knowledge-editor';
import { PreviewAsPlayer } from '@/components/content/preview-as-player';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { isContentVisible } from '@ramassa/shared/announcements';
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
      <div className="mx-4 mt-4 flex flex-wrap sm:mx-6 sm:mt-6 items-center justify-between gap-2">
        <Button asChild variant="link">
          <Link to="/content/knowledge">{t('backToList')}</Link>
        </Button>
        <PreviewAsPlayer
          target={`/knowledge/${article.id}`}
          isVisibleToPlayers={isContentVisible({
            status: article.is_published ? 'published' : 'draft',
            publishedAt: article.published_at,
            expiresAt: article.expires_at,
          })}
        />
      </div>
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
