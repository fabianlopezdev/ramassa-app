import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  SERVICE_REVIEW_PAGE_SIZE,
  type AdminServiceCategory,
  type ServiceReviewQueuePage,
  type ServiceReviewSearch,
} from '@ramassa/shared/services';

interface ServiceReviewQueueProps {
  readonly page: ServiceReviewQueuePage;
  readonly search: ServiceReviewSearch;
  readonly categories: readonly AdminServiceCategory[];
}

export function ServiceReviewQueue({ page, search, categories }: ServiceReviewQueueProps) {
  const { t, i18n } = useTranslation('services');
  const navigate = useNavigate({ from: '/content/services/reviews/' });
  const locale = (i18n.resolvedLanguage ?? 'ca') as keyof AdminServiceCategory['name'];
  const pages = Math.max(1, Math.ceil(page.total / SERVICE_REVIEW_PAGE_SIZE));

  function applySearch(next: Partial<ServiceReviewSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...next }) });
  }

  return (
    <section className="flex flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('reviewQueueTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('reviewQueueSummary', { count: page.total })}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/content/services">{t('backToList')}</Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t('reviewFilterKind')}</span>
          <select
            id="service-review-kind"
            name="kind"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="service-review-kind-filter"
            value={search.kind}
            onChange={(event) =>
              applySearch({ kind: event.target.value as ServiceReviewSearch['kind'] })
            }
          >
            <option value="all">{t('filterAll')}</option>
            <option value="pending">{t('reviewKindPending')}</option>
            <option value="published_edit">{t('reviewKindPublishedEdit')}</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t('filterCategory')}</span>
          <select
            id="service-review-category"
            name="category"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="service-review-category-filter"
            value={search.category}
            onChange={(event) =>
              applySearch({ category: event.target.value as ServiceReviewSearch['category'] })
            }
          >
            <option value="all">{t('filterAll')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name[locale] ?? category.name.ca}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium">{t('reviewFilterQuery')}</span>
          <Input
            id="service-review-query"
            name="query"
            type="search"
            maxLength={200}
            value={search.query}
            data-testid="service-review-query-filter"
            onChange={(event) => applySearch({ query: event.target.value })}
          />
        </label>
      </div>

      {page.items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-medium">{t('reviewQueueEmptyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('reviewQueueEmptyBody')}</p>
        </div>
      ) : (
        <ol className="grid gap-3" data-testid="service-review-queue">
          {page.items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
              data-testid={`service-review-item-${item.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{item.title[locale] ?? item.title.ca}</h2>
                  <Badge variant={item.kind === 'pending' ? 'default' : 'secondary'}>
                    {item.kind === 'pending'
                      ? t('reviewKindPending')
                      : t('reviewKindPublishedEdit')}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[item.providerName, item.contactName].filter(Boolean).join(' · ')}
                </p>
                <time
                  className="mt-2 block text-xs text-muted-foreground"
                  dateTime={item.changedAt}
                >
                  {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(item.changedAt))}
                </time>
              </div>
              <Button asChild size="sm">
                <Link
                  to="/content/services/reviews/$serviceId"
                  params={{ serviceId: item.serviceId }}
                  search={item.kind === 'published_edit' ? { notification: item.id } : {}}
                >
                  {t('reviewOpen')}
                </Link>
              </Button>
            </li>
          ))}
        </ol>
      )}

      <nav className="flex items-center justify-between gap-3" aria-label={t('reviewPagination')}>
        <Button
          type="button"
          variant="outline"
          disabled={search.page <= 1}
          onClick={() => void navigate({ search: { ...search, page: search.page - 1 } })}
        >
          {t('previous')}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t('page', { page: search.page, pages })}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={search.page >= pages}
          onClick={() => void navigate({ search: { ...search, page: search.page + 1 } })}
        >
          {t('next')}
        </Button>
      </nav>
    </section>
  );
}
