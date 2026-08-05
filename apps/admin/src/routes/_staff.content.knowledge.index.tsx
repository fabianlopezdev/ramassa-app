import { KnowledgeArticlesTable } from '@/components/content/knowledge-articles-table';
import { supabase } from '@/lib/supabase';
import { createFileRoute } from '@tanstack/react-router';
import { fetchKnowledgeArticles, knowledgeSearchSchema } from '@ramassa/shared/knowledge';

export const Route = createFileRoute('/_staff/content/knowledge/')({
  ssr: false,
  validateSearch: knowledgeSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => fetchKnowledgeArticles(supabase, deps),
  component: KnowledgePage,
});

function KnowledgePage() {
  return <KnowledgeArticlesTable page={Route.useLoaderData()} search={Route.useSearch()} />;
}
