import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  NOTIFICATION_AUDIENCE_KINDS,
  type CustomNotificationGroup,
  type NotificationAudience,
  type NotificationAudienceKind,
  type NotificationAudienceOptions,
} from '@ramassa/shared/notifications';

function audienceValue(audience: NotificationAudience | null): string {
  if (audience === null || audience.kind === 'all') return '';
  if (audience.kind === 'interest') return audience.serviceCategoryId;
  if (audience.kind === 'signup') return audience.eventId;
  if (audience.kind === 'entity') return audience.entityName;
  return audience.customGroupId;
}

export function audienceFromSelection(
  kind: '' | NotificationAudienceKind,
  value: string,
): NotificationAudience | null {
  if (kind === '') return null;
  if (kind === 'all') return { kind };
  if (value.length === 0) return null;
  if (kind === 'interest') return { kind, serviceCategoryId: value };
  if (kind === 'signup') return { kind, eventId: value };
  if (kind === 'entity') return { kind, entityName: value };
  return { kind, customGroupId: value };
}

export function AudiencePicker({
  idPrefix,
  audience,
  groups,
  options,
  onChange,
}: {
  readonly idPrefix: string;
  readonly audience: NotificationAudience | null;
  readonly groups: readonly CustomNotificationGroup[];
  readonly options: NotificationAudienceOptions;
  readonly onChange: (audience: NotificationAudience | null) => void;
}) {
  const { t } = useTranslation('notifications');
  const [kind, setKind] = useState<'' | NotificationAudienceKind>(audience?.kind ?? '');
  const value = audienceValue(audience);
  const choices =
    kind === 'interest'
      ? options.serviceCategories.map((item) => [item.id, item.name] as const)
      : kind === 'signup'
        ? options.events.map((item) => [item.id, item.title] as const)
        : kind === 'entity'
          ? options.entities.map((name) => [name, name] as const)
          : kind === 'custom_group'
            ? groups.map((group) => [group.id, group.name] as const)
            : [];

  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium">
        {t('audienceKind')}
        <select
          id={`${idPrefix}-audience-kind`}
          name={`${idPrefix}-audience-kind`}
          data-testid={`${idPrefix}-audience-kind`}
          value={kind}
          onChange={(event) => {
            const nextKind = event.target.value as '' | NotificationAudienceKind;
            setKind(nextKind);
            onChange(audienceFromSelection(nextKind, ''));
          }}
          className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3"
        >
          <option value="">{t('selectOption')}</option>
          {NOTIFICATION_AUDIENCE_KINDS.map((item) => (
            <option key={item} value={item}>
              {t(
                `audience${item === 'custom_group' ? 'CustomGroup' : item.slice(0, 1).toUpperCase() + item.slice(1)}`,
              )}
            </option>
          ))}
        </select>
      </label>
      {kind !== '' && kind !== 'all' ? (
        <select
          id={`${idPrefix}-audience-value`}
          name={`${idPrefix}-audience-value`}
          aria-label={t('audienceTitle')}
          value={value}
          onChange={(event) => onChange(audienceFromSelection(kind, event.target.value))}
          className="min-h-11 rounded-lg border border-neutral-300 bg-white px-3"
          data-testid={`${idPrefix}-audience-value`}
        >
          <option value="">{t('selectOption')}</option>
          {choices.map(([choiceValue, label]) => (
            <option key={choiceValue} value={choiceValue}>
              {label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
