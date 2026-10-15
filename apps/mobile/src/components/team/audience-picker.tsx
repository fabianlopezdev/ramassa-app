/**
 * Who a notification or a survey reaches (RAPP-385), as the web admin's
 * audience picker: every active participant, those interested in a service
 * category, those signed up to an event, those referred by an entity, or a
 * custom group. The kind comes first; then the category, event, entity or
 * group. Shared by notifications and surveys.
 */
import { ChoiceOption } from '@/components/equipment/choice-option';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  NOTIFICATION_AUDIENCE_KINDS,
  type CustomNotificationGroup,
  type NotificationAudience,
  type NotificationAudienceKind,
  type NotificationAudienceOptions,
} from '@ramassa/shared/notifications';

const KIND_KEYS: Readonly<Record<NotificationAudienceKind, string>> = {
  all: 'audienceAll',
  interest: 'audienceInterest',
  signup: 'audienceSignup',
  entity: 'audienceEntity',
  custom_group: 'audienceCustomGroup',
};

function audienceValue(audience: NotificationAudience | null): string {
  if (audience === null || audience.kind === 'all') return '';
  if (audience.kind === 'interest') return audience.serviceCategoryId;
  if (audience.kind === 'signup') return audience.eventId;
  if (audience.kind === 'entity') return audience.entityName;
  return audience.customGroupId;
}

function audienceFromSelection(
  kind: NotificationAudienceKind | null,
  value: string,
): NotificationAudience | null {
  if (kind === null) return null;
  if (kind === 'all') return { kind };
  if (value.length === 0) return null;
  if (kind === 'interest') return { kind, serviceCategoryId: value };
  if (kind === 'signup') return { kind, eventId: value };
  if (kind === 'entity') return { kind, entityName: value };
  return { kind, customGroupId: value };
}

export function AudiencePicker({
  testIDPrefix,
  audience,
  groups,
  options,
  onChange,
}: {
  readonly testIDPrefix: string;
  readonly audience: NotificationAudience | null;
  readonly groups: readonly CustomNotificationGroup[];
  readonly options: NotificationAudienceOptions;
  readonly onChange: (audience: NotificationAudience | null) => void;
}) {
  const { t } = useTranslation('notifications');
  const fontClass = useLanguageFontClass();
  const [kind, setKind] = useState<NotificationAudienceKind | null>(audience?.kind ?? null);
  const value = audienceValue(audience);
  const choices: readonly (readonly [string, string])[] =
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
    <View className="gap-sm">
      <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
        {t('audienceKind')}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        {NOTIFICATION_AUDIENCE_KINDS.map((candidate) => (
          <ChoiceOption
            key={candidate}
            testID={`${testIDPrefix}-audience-kind-${candidate}`}
            value={candidate}
            label={t(KIND_KEYS[candidate])}
            selected={candidate === kind}
            onSelect={(next) => {
              setKind(next);
              onChange(audienceFromSelection(next, ''));
            }}
            languageFontClass={fontClass}
          />
        ))}
      </View>
      {kind === null || kind === 'all' ? null : (
        <View className="gap-sm">
          <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
            {t('audienceTitle')}
          </Text>
          <View className="flex-row flex-wrap gap-sm">
            {choices.map(([choiceValue, label]) => (
              <ChoiceOption
                key={choiceValue}
                testID={`${testIDPrefix}-audience-value-${choiceValue}`}
                value={choiceValue}
                label={label}
                selected={choiceValue === value}
                onSelect={(next) => onChange(audienceFromSelection(kind, next))}
                languageFontClass={fontClass}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
