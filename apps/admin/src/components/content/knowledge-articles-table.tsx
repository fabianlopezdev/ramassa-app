import { DataTable } from '@/components/data-table/data-table';
import { DataTablePager } from '@/components/data-table/data-table-pager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAnnouncementLifecycle } from '@ramassa/shared/announcements';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  deleteKnowledgeArticle,
  KNOWLEDGE_PAGE_SIZE,
  transitionParticipantStory,
  type KnowledgeArticleListRow,
  type KnowledgeArticlePage,
  type KnowledgeSearch,
} from '@ramassa/shared/knowledge';

export interface KnowledgeArticlesTableProps {
  readonly page: KnowledgeArticlePage;
  readonly search: KnowledgeSearch;
}

export function KnowledgeArticlesTable({ page, search }: KnowledgeArticlesTableProps) {
  const { t } = useTranslation(['knowledge', 'errors']);
  const navigate = useNavigate({ from: '/content/knowledge/' });
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);

  function applySearch(next: Partial<KnowledgeSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...next }) });
  }

  const mutateRow = useCallback(
    async (rowId: string, operation: () => Promise<void>) => {
      setBusyId(rowId);
      setErrorCode(null);
      const result = await safeAsync(
        async () => {
          await operation();
          await router.invalidate({ sync: true });
        },
        { code: 'DB-1', context: { operation: 'mutate-knowledge-resource' } },
      );
      if (!result.ok) setErrorCode(result.error.code);
      setBusyId(null);
    },
    [router],
  );

  const columns = useMemo<ColumnDef<KnowledgeArticleListRow, unknown>[]>(
    () => [
      {
        id: 'title',
        header: t('knowledge:columnTitle'),
        cell: ({ row }) => (
          <Link
            to="/content/knowledge/$articleId"
            params={{ articleId: row.original.id }}
            className="font-medium underline-offset-4 hover:underline"
            data-testid={`knowledge-link-${row.original.id}`}
          >
            {row.original.title.ca}
          </Link>
        ),
      },
      {
        id: 'category',
        header: t('knowledge:columnCategory'),
        cell: ({ row }) => row.original.category.name.ca,
      },
      {
        id: 'type',
        header: t('knowledge:columnType'),
        cell: ({ row }) => typeLabel(row.original, t),
      },
      {
        id: 'status',
        header: t('knowledge:columnStatus'),
        cell: ({ row }) => <KnowledgeStatusBadge article={row.original} />,
      },
      {
        id: 'author',
        header: t('knowledge:columnAuthor'),
        cell: ({ row }) =>
          row.original.author_first_name === null
            ? t('knowledge:noAuthor')
            : t('knowledge:participantAttribution', { name: row.original.author_first_name }),
      },
      {
        id: 'actions',
        header: t('knowledge:columnActions'),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            {row.original.story_status === 'submitted' ? (
              <Button
                type="button"
                size="sm"
                disabled={busyId === row.original.id}
                data-testid={`knowledge-start-review-${row.original.id}`}
                onClick={() =>
                  void mutateRow(row.original.id, () =>
                    transitionParticipantStory(
                      supabase,
                      row.original.id,
                      'submitted',
                      'in_review',
                      null,
                    ),
                  )
                }
              >
                {t('knowledge:startReview')}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyId === row.original.id}
              data-testid={`knowledge-delete-${row.original.id}`}
              onClick={() => {
                if (!window.confirm(t('knowledge:deleteConfirm'))) return;
                void mutateRow(row.original.id, () =>
                  deleteKnowledgeArticle(supabase, row.original.id),
                );
              }}
            >
              {t('knowledge:delete')}
            </Button>
          </div>
        ),
      },
    ],
    [busyId, mutateRow, t],
  );

  const pages = Math.max(1, Math.ceil(page.total / KNOWLEDGE_PAGE_SIZE));
  return (
    <section className="flex flex-col gap-4 p-6" data-testid="knowledge-table">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('knowledge:title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('knowledge:summary', { count: page.total })}
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/content/knowledge/new">{t('knowledge:newAction')}</Link>
        </Button>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('knowledge:filterKind')}</span>
          <select
            id="knowledge-kind-filter"
            name="knowledge-kind-filter"
            className="h-9 rounded-md border bg-background px-3"
            data-testid="knowledge-kind-filter"
            value={search.kind}
            onChange={(event) =>
              applySearch({ kind: event.target.value as KnowledgeSearch['kind'] })
            }
          >
            <option value="all">{t('knowledge:filterAll')}</option>
            <option value="articles">{t('knowledge:filterArticles')}</option>
            <option value="stories">{t('knowledge:filterStories')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('knowledge:filterStoryStatus')}</span>
          <select
            id="knowledge-story-status-filter"
            name="knowledge-story-status-filter"
            className="h-9 rounded-md border bg-background px-3"
            data-testid="knowledge-story-status-filter"
            value={search.storyStatus}
            onChange={(event) =>
              applySearch({
                kind: 'stories',
                storyStatus: event.target.value as KnowledgeSearch['storyStatus'],
              })
            }
          >
            <option value="all">{t('knowledge:filterAll')}</option>
            {(
              ['submitted', 'in_review', 'changes_requested', 'published', 'rejected'] as const
            ).map((status) => (
              <option key={status} value={status}>
                {t(`knowledge:status${camelLabel(status)}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DataTable
        columns={columns}
        rows={page.rows}
        sorting={[]}
        onSortingChange={() => undefined}
        empty={
          <div className="rounded-md border border-dashed p-8">
            <p className="font-medium">{t('knowledge:emptyTitle')}</p>
            <p className="text-sm text-muted-foreground">{t('knowledge:emptyBody')}</p>
            <Button
              variant="outline"
              onClick={() => applySearch({ kind: 'all', storyStatus: 'all' })}
            >
              {t('knowledge:clearFilters')}
            </Button>
          </div>
        }
      />
      {errorCode === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors:${errorCode}`)}
        </p>
      )}
      <DataTablePager
        page={search.page}
        pages={pages}
        onPageChange={(next) =>
          void navigate({ search: (previous) => ({ ...previous, page: next }) })
        }
      />
    </section>
  );
}

function KnowledgeStatusBadge({ article }: { readonly article: KnowledgeArticleListRow }) {
  const { t } = useTranslation('knowledge');
  const status =
    article.story_status ??
    getAnnouncementLifecycle({
      status: article.is_published ? 'published' : 'draft',
      publishedAt: article.published_at,
      expiresAt: article.expires_at,
    });
  return (
    <Badge variant={status === 'rejected' || status === 'expired' ? 'outline' : 'secondary'}>
      {t(`status${camelLabel(status)}`)}
    </Badge>
  );
}

function camelLabel(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join('');
}

function typeLabel(article: KnowledgeArticleListRow, t: (key: string) => string): string {
  return t(`knowledge:type${camelLabel(article.content_type)}`);
}
