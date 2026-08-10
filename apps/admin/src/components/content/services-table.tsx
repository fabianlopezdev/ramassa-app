import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  ADMIN_SERVICE_PAGE_SIZE,
  deleteAdminService,
  fetchAdminService,
  getServiceLifecycle,
  saveAdminService,
  SERVICE_LIFECYCLES,
  type AdminServiceCategory,
  type AdminServiceDetail,
  type AdminServicePage,
  type AdminServiceRow,
  type ServiceSearch,
} from '@ramassa/shared/services';

export function ServicesTable({
  page,
  search,
  categories,
}: {
  readonly page: AdminServicePage;
  readonly search: ServiceSearch;
  readonly categories: readonly AdminServiceCategory[];
}) {
  const { t, i18n } = useTranslation(['services', 'errors']);
  const navigate = useNavigate({ from: '/content/services/' });
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const locale = (i18n.resolvedLanguage ?? 'ca') as keyof AdminServiceCategory['name'];
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const pages = Math.max(1, Math.ceil(page.total / ADMIN_SERVICE_PAGE_SIZE));

  function applySearch(next: Partial<ServiceSearch>) {
    void navigate({ search: (previous) => ({ ...previous, page: 1, ...next }) });
  }

  async function mutate(serviceId: string, operation: () => Promise<void>) {
    setBusyId(serviceId);
    setErrorCode(null);
    const result = await safeAsync(
      async () => {
        await operation();
        await router.invalidate({ sync: true });
      },
      { code: 'DB-1', context: { operation: 'mutate-service' } },
    );
    if (!result.ok) setErrorCode(result.error.code);
    setBusyId(null);
  }

  async function setPublished(row: AdminServiceRow, published: boolean) {
    const category = categoryById.get(row.category_id);
    if (category === undefined) throw new AppError('DB-1');
    const detail = await fetchAdminService(supabase, row.id);
    await saveAdminService(supabase, category, detailInput(detail, published), row.id);
  }

  return (
    <section className="flex flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('services:title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('services:summary', { count: page.total })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/content/services/categories">{t('services:categoriesAction')}</Link>
          </Button>
          <Button asChild>
            <Link to="/content/services/new">{t('services:newAction')}</Link>
          </Button>
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('services:filterCategory')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="service-category-filter"
            value={search.category}
            onChange={(event) =>
              applySearch({ category: event.target.value as ServiceSearch['category'] })
            }
          >
            <option value="all">{t('services:filterAll')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name[locale] ?? category.name.ca}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('services:filterStatus')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="service-status-filter"
            value={search.status}
            onChange={(event) =>
              applySearch({ status: event.target.value as ServiceSearch['status'] })
            }
          >
            <option value="all">{t('services:filterAll')}</option>
            {SERVICE_LIFECYCLES.map((status) => (
              <option key={status} value={status}>
                {t(`services:status${capitalize(status)}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">{t('services:columnTitle')}</th>
              <th className="p-3">{t('services:columnCategory')}</th>
              <th className="p-3">{t('services:columnStatus')}</th>
              <th className="p-3">{t('services:columnInterests')}</th>
              <th className="p-3">{t('services:columnUpdated')}</th>
              <th className="p-3">{t('services:columnActions')}</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => {
              const lifecycle = getServiceLifecycle({
                status: row.status,
                publishedAt: row.published_at,
                expiresAt: row.expires_at,
              });
              return (
                <tr key={row.id} className="border-t" data-testid={`service-row-${row.id}`}>
                  <td className="p-3">
                    <Link
                      className="font-medium hover:underline"
                      data-testid={`service-link-${row.id}`}
                      to="/content/services/$serviceId"
                      params={{ serviceId: row.id }}
                    >
                      {row.title.ca}
                    </Link>
                  </td>
                  <td className="p-3">
                    {categoryById.get(row.category_id)?.name[locale] ??
                      categoryById.get(row.category_id)?.name.ca}
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">
                      {t(`services:status${capitalize(lifecycle)}`)}
                    </Badge>
                  </td>
                  <td className="p-3 tabular-nums" data-testid={`service-interest-count-${row.id}`}>
                    {row.interest_count}
                  </td>
                  <td className="p-3">
                    {new Date(row.updated_at).toLocaleString(i18n.resolvedLanguage)}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {row.status === 'draft' || row.status === 'published' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          data-testid={`service-publish-${row.id}`}
                          onClick={() =>
                            void mutate(row.id, () => setPublished(row, row.status !== 'published'))
                          }
                        >
                          {row.status === 'published'
                            ? t('services:unpublish')
                            : t('services:publish')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busyId === row.id}
                        data-testid={`service-delete-${row.id}`}
                        onClick={() => {
                          if (window.confirm(t('services:deleteConfirm')))
                            void mutate(row.id, () => deleteAdminService(supabase, row.id));
                        }}
                      >
                        {t('services:delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {page.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8">
          <p className="font-medium">{t('services:emptyTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('services:emptyBody')}</p>
        </div>
      ) : null}
      {errorCode === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors:${errorCode}`)}
        </p>
      )}
      <footer className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={search.page <= 1}
          onClick={() =>
            void navigate({ search: (previous) => ({ ...previous, page: previous.page - 1 }) })
          }
        >
          {t('services:previous')}
        </Button>
        <span className="text-sm">{t('services:page', { page: search.page, pages })}</span>
        <Button
          type="button"
          variant="outline"
          disabled={search.page >= pages}
          onClick={() =>
            void navigate({ search: (previous) => ({ ...previous, page: previous.page + 1 }) })
          }
        >
          {t('services:next')}
        </Button>
      </footer>
    </section>
  );
}

function detailInput(detail: AdminServiceDetail, published: boolean) {
  const service = detail.service;
  return {
    categoryId: service.category_id,
    title: service.title,
    description: service.description,
    providerName: service.provider_name,
    location: service.location,
    zone: service.zone,
    costType: service.cost_type,
    costAmount: service.cost_amount,
    costDetails: service.cost_details,
    contactName: service.contact_name,
    contactPhone: service.contact_phone,
    contactEmail: service.contact_email,
    contactRole: service.contact_role,
    schedule: service.schedule,
    externalUrl: service.external_url,
    availability: service.availability,
    metadata: service.metadata,
    status: published ? ('published' as const) : ('draft' as const),
    publishedAt: published ? new Date().toISOString() : null,
    expiresAt: published ? service.expires_at : null,
    images: detail.images.map((image) => ({ url: image.url, altText: image.alt_text })),
  };
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
