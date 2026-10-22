import { AuthTextField } from '@/components/auth/auth-text-field';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PressableScale } from '@/components/motion/pressable-scale';
import { OptionChip } from '@/components/onboarding/option-chip';
import { optionGridColumnCount } from '@/components/onboarding/option-grid';
import { QuestionHelp } from '@/components/onboarding/question-help';
import { continuousCorners } from '@/lib/continuous-corners';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import {
  SUPPORTING_ENTITIES_MAX,
  SUPPORTING_ENTITY_NAME_MAX_LENGTH,
} from '@ramassa/shared/schemas';
import { tokens } from '@ramassa/shared/tokens';

/**
 * A list she builds one item at a time: suggestions to tap, a field to type
 * another, and the added items with a remove control. The supporting
 * organizations question uses it, and so does a staff "list" question
 * (RAPP-610) with its own field label, add label and limit.
 */
export function SupportingEntitiesField({
  value,
  onChange,
  entityNames,
  label,
  help,
  testIDPrefix,
  inputLabel,
  addLabel,
  removeLabel,
  maxItems = SUPPORTING_ENTITIES_MAX,
  maxLength = SUPPORTING_ENTITY_NAME_MAX_LENGTH,
}: {
  readonly value: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
  readonly entityNames: readonly string[];
  readonly label: string;
  readonly help?: string | null;
  readonly testIDPrefix: string;
  readonly inputLabel?: string;
  readonly addLabel?: string;
  readonly removeLabel?: (name: string) => string;
  readonly maxItems?: number;
  readonly maxLength?: number;
}) {
  const { t } = useTranslation('onboarding');
  const fontClass = useLanguageFontClass();
  const { width, fontScale } = useWindowDimensions();
  const isInline = optionGridColumnCount(width - tokens.spacing.lg * 2, fontScale) >= 2;
  const [name, setName] = useState('');
  const add = (candidate: string) => {
    const trimmed = candidate.trim();
    if (trimmed === '' || value.includes(trimmed) || value.length >= maxItems) return;
    onChange([...value, trimmed]);
    setName('');
  };
  return (
    <View className="gap-md">
      <Text className={`text-start text-form text-neutral-800 ${fontClass}`}>{label}</Text>
      <QuestionHelp text={help ?? null} />
      {entityNames.some((entity) => !value.includes(entity)) ? (
        <View className="flex-row flex-wrap gap-sm">
          {entityNames
            .filter((entity) => !value.includes(entity))
            .map((entity) => (
              <OptionChip
                key={entity}
                label={entity}
                isSelected={false}
                onPress={() => add(entity)}
              />
            ))}
        </View>
      ) : null}
      <View className={isInline ? 'flex-row items-end gap-sm' : 'gap-sm'}>
        <View className={isInline ? 'flex-1' : 'w-full'}>
          <AuthTextField
            testID={`${testIDPrefix}-supporting-entity-other`}
            label={inputLabel ?? t('onboarding:supportingEntitiesOtherLabel')}
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => add(name)}
            maxLength={maxLength}
          />
        </View>
        <RaisedActionButton
          testID={`${testIDPrefix}-supporting-entity-add`}
          label={addLabel ?? t('onboarding:supportingEntitiesAddAction')}
          onPress={() => add(name)}
        />
      </View>
      {value.length === 0 ? null : (
        <View className="gap-sm" testID={`${testIDPrefix}-supporting-entities-list`}>
          {value.map((entity) => (
            <View
              key={entity}
              style={continuousCorners}
              className="w-full flex-row items-center gap-sm rounded-lg border border-neutral-200 bg-neutral-50 px-md py-sm"
            >
              <Text className={`flex-1 text-start text-form text-neutral-900 ${fontClass}`}>
                {entity}
              </Text>
              <PressableScale
                style={continuousCorners}
                accessibilityRole="button"
                accessibilityLabel={
                  removeLabel?.(entity) ??
                  t('onboarding:supportingEntitiesRemoveAction', { name: entity })
                }
                onPress={() => onChange(value.filter((existing) => existing !== entity))}
                haptic="tapLight"
                className="min-h-recommended min-w-recommended items-center justify-center rounded-md"
              >
                <Text
                  className={`text-xl font-medium text-primary ${fontClass}`}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                >
                  ×
                </Text>
              </PressableScale>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
