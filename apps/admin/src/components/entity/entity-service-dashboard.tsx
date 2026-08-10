import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppErrorCode } from '@ramassa/shared/errors';
import type { AdminServiceCategory } from '@ramassa/shared/services';
import {
  deleteEntityService,
  getEntityServiceActions,
  resubmitEntityService,
  type EntityServiceDecisionNotification,
  type EntityServiceRow,
} from '@ramassa/shared/services/entity';
import { EntityServiceStateChip } from './entity-service-state-chip';

interface EntityServiceDashboardProps {
  readonly initialServices: readonly EntityServiceRow[];
  readonly categories: readonly AdminServiceCategory[];
  readonly notifications: readonly EntityServiceDecisionNotification[];
}

export function EntityServiceDashboard({
  initialServices,
  categories,
  notifications,
}: EntityServiceDashboardProps) {
  const { t, i18n } = useTranslation(['entity-services', 'errors']);
  const [services, setServices] = useState(initialServices);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const language = i18n.resolvedLanguage ?? 'ca';

  async function remove(serviceId: string) {
    if (!window.confirm(t('entity-services:deleteConfirm'))) return;
    setErrorCode(null);
    const result = await safeAsync(() => deleteEntityService(supabase, serviceId), {
      context: { operation: 'entity-service-delete' },
    });
    if (!result.ok) setErrorCode(result.error.code);
    else setServices((current) => current.filter((service) => service.id !== serviceId));
  }

  async function resubmit(serviceId: string) {
    setErrorCode(null);
    const result = await safeAsync(() => resubmitEntityService(supabase, serviceId), {
      context: { operation: 'entity-service-resubmit' },
    });
    if (!result.ok) setErrorCode(result.error.code);
    else {
      setServices((current) =>
        current.map((service) =>
          service.id === serviceId
            ? { ...service, status: 'pending', rejection_reason: null }
            : service,
        ),
      );
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('entity-services:title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('entity-services:intro')}</p>
        </div>
        <Button asChild data-testid="entity-service-new">
          <Link to="/portal/services/new">{t('entity-services:newAction')}</Link>
        </Button>
      </header>

      {errorCode === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors:${errorCode}`)}
        </p>
      )}

      {notifications.length === 0 ? null : (
        <section className="rounded-xl border bg-card p-5" aria-labelledby="decision-title">
          <h2 id="decision-title" className="text-lg font-semibold">
            {t('entity-services:decisionTitle')}
          </h2>
          <ol className="mt-4 grid gap-3" data-testid="entity-service-decisions">
            {notifications.map((notification) => (
              <li key={notification.id} className="rounded-lg bg-muted p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {notification.serviceTitle[
                        language as keyof typeof notification.serviceTitle
                      ] ?? notification.serviceTitle.ca}
                    </p>
                    <p className="mt-1 text-sm">
                      {notification.kind === 'approved'
                        ? t('entity-services:decisionApproved')
                        : t('entity-services:decisionRejected')}
                    </p>
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={notification.createdAt}>
                    {new Intl.DateTimeFormat(language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(notification.createdAt))}
                  </time>
                </div>
                {notification.comment === null ? null : (
                  <p
                    className="mt-3 whitespace-pre-wrap text-sm"
                    data-testid={`entity-service-decision-comment-${notification.id}`}
                  >
                    {notification.comment}
                  </p>
                )}
                <Button asChild variant="link" className="mt-2 h-auto p-0">
                  <Link
                    to="/portal/services/$serviceId"
                    params={{ serviceId: notification.serviceId }}
                  >
                    {t('entity-services:decisionOpen')}
                  </Link>
                </Button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {services.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <h2 className="font-medium">{t('entity-services:emptyTitle')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('entity-services:emptyBody')}</p>
        </div>
      ) : (
        <ul className="grid gap-4" data-testid="entity-service-list">
          {services.map((service) => {
            const category = categories.find((item) => item.id === service.category_id);
            const actions = getEntityServiceActions(service.status);
            return (
              <li
                key={service.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
                data-testid={`entity-service-row-${service.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{service.title.ca}</h2>
                    <EntityServiceStateChip service={service} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {category?.name[language as keyof typeof category.name] ?? category?.name.ca}
                  </p>
                  {service.rejection_reason === null ? null : (
                    <p className="mt-2 text-sm text-destructive">
                      {t('entity-services:rejectionLabel')}: {service.rejection_reason}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/portal/services/$serviceId" params={{ serviceId: service.id }}>
                      {actions.includes('edit')
                        ? t('entity-services:edit')
                        : t('entity-services:view')}
                    </Link>
                  </Button>
                  {actions.includes('resubmit') ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      data-testid={`entity-service-resubmit-${service.id}`}
                      onClick={() => void resubmit(service.id)}
                    >
                      {t('entity-services:resubmit')}
                    </Button>
                  ) : null}
                  {actions.includes('delete') ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      data-testid={`entity-service-delete-${service.id}`}
                      onClick={() => void remove(service.id)}
                    >
                      {t('entity-services:delete')}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
