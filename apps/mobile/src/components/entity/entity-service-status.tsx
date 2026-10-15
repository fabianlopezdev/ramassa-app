/**
 * A service submission's status as the entity reads it (RAPP-414), as the web
 * portal's chip: draft, awaiting review, approved, rejected, published, or
 * scheduled when it is published with a date still to come.
 */
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { EntityServiceRow } from '@ramassa/shared/services/entity';

const labelKeyByStatus = {
  draft: 'statusDraft',
  pending: 'statusPending',
  approved: 'statusApproved',
  rejected: 'statusRejected',
  published: 'statusPublished',
} as const satisfies Record<EntityServiceRow['status'], string>;

const toneByStatus = {
  draft: { box: 'bg-neutral-100', text: 'text-neutral-800' },
  pending: { box: 'bg-neutral-100', text: 'text-neutral-800' },
  approved: { box: 'bg-primary-light', text: 'text-primary-dark' },
  rejected: { box: 'bg-error', text: 'text-white' },
  published: { box: 'bg-primary-light', text: 'text-primary-dark' },
} as const satisfies Record<EntityServiceRow['status'], { box: string; text: string }>;

export function EntityServiceStatus({ service }: { readonly service: EntityServiceRow }) {
  const { t } = useTranslation('entity-services');
  const fontClass = useLanguageFontClass();
  const isScheduled =
    service.status === 'published' &&
    service.published_at !== null &&
    new Date(service.published_at).getTime() > Date.now();
  return (
    <View
      testID={`entity-service-status-${service.id}`}
      style={continuousCorners}
      className={`self-start rounded-sm px-sm py-xs ${toneByStatus[service.status].box}`}
    >
      <Text className={`text-sm font-semibold ${toneByStatus[service.status].text} ${fontClass}`}>
        {t(isScheduled ? 'statusScheduled' : labelKeyByStatus[service.status])}
      </Text>
    </View>
  );
}
