import { useTranslation } from 'react-i18next';
import type { EntityServiceRow } from '@ramassa/shared/services/entity';
import { EntityServiceStateChip } from './entity-service-state-chip';

export function EntityServiceReadonly({ service }: { readonly service: EntityServiceRow }) {
  const { t, i18n } = useTranslation('entity-services');
  const noticeKey = service.status === 'approved' ? 'approvedNotice' : 'pendingNotice';
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{service.title.ca}</h1>
        <EntityServiceStateChip service={service} />
      </div>
      <p className="rounded-lg bg-muted p-3 text-sm">{t(noticeKey)}</p>
      {service.description?.ca === undefined ? null : (
        <p className="whitespace-pre-wrap text-sm">{service.description.ca}</p>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t('createdAt')}</dt>
          <dd>
            {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca').format(
              new Date(service.created_at),
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('updatedAt')}</dt>
          <dd>
            {new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'ca').format(
              new Date(service.updated_at),
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
