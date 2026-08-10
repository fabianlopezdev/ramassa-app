import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import type { EntityServiceRow } from '@ramassa/shared/services/entity';

type Status = EntityServiceRow['status'];

const labelKeyByStatus: Readonly<Record<Status, string>> = {
  draft: 'statusDraft',
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
  published: 'statusPublished',
};

const variantByStatus: Readonly<
  Record<Status, 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  draft: 'outline',
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  published: 'default',
};

export function EntityServiceStateChip({ service }: { readonly service: EntityServiceRow }) {
  const { t } = useTranslation('entity-services');
  const isScheduled =
    service.status === 'published' &&
    service.published_at !== null &&
    new Date(service.published_at).getTime() > Date.now();

  return (
    <Badge variant={variantByStatus[service.status]} data-testid={`service-status-${service.id}`}>
      {t(isScheduled ? 'statusScheduled' : labelKeyByStatus[service.status])}
    </Badge>
  );
}
