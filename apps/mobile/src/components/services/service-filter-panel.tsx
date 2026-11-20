import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { RaisedChip } from '@/components/layout/filter-chips';
import type { PlayerServiceFilterSelection } from '@/lib/player-services';
import {
  availableServiceZones,
  buildPlayerServiceMetadataFilterGroups,
} from '@/lib/service-filter-model';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { resolveLocalizedText, useLanguage } from '@ramassa/shared/i18n';
import {
  SERVICE_AVAILABILITIES,
  SERVICE_COST_TYPES,
  type PlayerServiceRow,
  type ServiceCategoryContract,
} from '@ramassa/shared/services';

type FilterValue = string | number | boolean;

const FilterChip = memo(function FilterChip({
  value,
  label,
  groupLabel,
  selected,
  onToggle,
  languageFontClass,
}: {
  readonly value: FilterValue;
  readonly label: string;
  readonly groupLabel: string;
  readonly selected: boolean;
  readonly onToggle: (value: FilterValue) => void;
  readonly languageFontClass: string;
}) {
  const handlePress = useCallback(() => onToggle(value), [onToggle, value]);
  return (
    <RaisedChip
      accessibilityRole="checkbox"
      label={label}
      accessibilityHint={groupLabel}
      isSelected={selected}
      onPress={handlePress}
      languageFontClass={languageFontClass}
    />
  );
});

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
  optionLabel,
}: {
  readonly label: string;
  readonly options: readonly FilterValue[];
  readonly selected: readonly FilterValue[];
  readonly onToggle: (value: FilterValue) => void;
  readonly optionLabel: (value: FilterValue) => string;
}) {
  const languageFontClass = useLanguageFontClass();
  if (options.length === 0) return null;
  return (
    <View className="gap-sm">
      <Text className={`text-start text-md font-bold text-neutral-900 ${languageFontClass}`}>
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        {options.map((option) => (
          <FilterChip
            key={String(option)}
            value={option}
            label={optionLabel(option)}
            groupLabel={label}
            selected={selected.includes(option)}
            onToggle={onToggle}
            languageFontClass={languageFontClass}
          />
        ))}
      </View>
    </View>
  );
}

export function ServiceFilterPanel({
  contract,
  availableServices,
  selection,
  onChange,
  onClear,
}: {
  readonly contract: ServiceCategoryContract;
  readonly availableServices: readonly PlayerServiceRow[];
  readonly selection: PlayerServiceFilterSelection;
  readonly onChange: (selection: PlayerServiceFilterSelection) => void;
  readonly onClear: () => void;
}) {
  const { t } = useTranslation('playerServices');
  const { language } = useLanguage();
  const metadataGroups = useMemo(
    () => buildPlayerServiceMetadataFilterGroups(contract, availableServices),
    [availableServices, contract],
  );
  const zones = useMemo(() => availableServiceZones(availableServices), [availableServices]);
  const labelOption = useCallback(
    (value: FilterValue) => {
      if (value === true) return t('filterYes');
      if (value === false) return t('filterNo');
      if (typeof value === 'number') return String(value);
      return t(`option.${value}`, { defaultValue: value.replaceAll('_', ' ') });
    },
    [t],
  );
  const toggleZone = useCallback(
    (value: FilterValue) =>
      onChange({ ...selection, zone: selection.zone === value ? undefined : String(value) }),
    [onChange, selection],
  );
  const toggleCost = useCallback(
    (value: FilterValue) =>
      onChange({
        ...selection,
        costType: selection.costType === value ? undefined : (String(value) as never),
      }),
    [onChange, selection],
  );
  const toggleAvailability = useCallback(
    (value: FilterValue) =>
      onChange({
        ...selection,
        availability: selection.availability === value ? undefined : (String(value) as never),
      }),
    [onChange, selection],
  );
  const toggleMetadata = useCallback(
    (key: string, type: string, value: FilterValue) => {
      const metadata = { ...(selection.metadata ?? {}) };
      const current = metadata[key];
      if (type === 'string-array') {
        const values = Array.isArray(current) ? [...current] : [];
        const next = values.includes(value)
          ? values.filter((candidate) => candidate !== value)
          : [...values, value];
        if (next.length === 0) delete metadata[key];
        else metadata[key] = next;
      } else if (current === value) {
        delete metadata[key];
      } else {
        metadata[key] = value;
      }
      onChange({ ...selection, metadata });
    },
    [onChange, selection],
  );

  return (
    <View className="gap-lg">
      <RaisedActionButton
        testID="services-clear-filters"
        size="compact"
        icon="trash"
        label={t('filterClear')}
        onPress={onClear}
      />
      <FilterGroup
        label={t('filterZone')}
        options={zones}
        selected={selection.zone === undefined ? [] : [selection.zone]}
        onToggle={toggleZone}
        optionLabel={labelOption}
      />
      <FilterGroup
        label={t('filterCost')}
        options={SERVICE_COST_TYPES}
        selected={selection.costType === undefined ? [] : [selection.costType]}
        onToggle={toggleCost}
        optionLabel={(value) => t(`cost${capitalize(String(value))}`)}
      />
      <FilterGroup
        label={t('filterAvailability')}
        options={SERVICE_AVAILABILITIES}
        selected={selection.availability === undefined ? [] : [selection.availability]}
        onToggle={toggleAvailability}
        optionLabel={(value) => t(`availability${availabilityKey(String(value))}`)}
      />
      {metadataGroups.map((group) => {
        const resolvedLabel = resolveLocalizedText(group.field.label, language);
        if (resolvedLabel === undefined) return null;
        const current = selection.metadata?.[group.key];
        const selected = Array.isArray(current)
          ? (current as FilterValue[])
          : current === undefined
            ? []
            : [current as FilterValue];
        return (
          <FilterGroup
            key={group.key}
            label={resolvedLabel.text}
            options={group.options}
            selected={selected}
            onToggle={(value) => toggleMetadata(group.key, group.field.type, value)}
            optionLabel={labelOption}
          />
        );
      })}
    </View>
  );
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function availabilityKey(value: string): string {
  if (value === 'waiting_list') return 'WaitingList';
  if (value === 'by_appointment') return 'ByAppointment';
  return capitalize(value);
}
