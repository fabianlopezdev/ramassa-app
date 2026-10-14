/**
 * A service category's extra fields on the phone (RAPP-344), the native side of
 * the web admin's dynamic fields. Each field type gets a touch control with
 * fixed values as choices: a select is a row of chips, a list field chips that
 * toggle, yes or no a switch, a date the native date picker. A number keeps the
 * digits as typed until the form saves; text is a multi-line field. Labels are
 * the category's own, in the screen language.
 */
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Text, View } from 'react-native';
import type { SupportedLanguage } from '@ramassa/shared/i18n';
import type { ServiceMetadataFieldDefinition } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';
import { DateField } from './date-field';
import { fieldLabel } from './service-labels';

/**
 * The digits stay as typed ("12." while she types "12.5"); the form gets a
 * number once the text is one, and the text itself otherwise, which the check
 * then refuses.
 */
function NumberField({
  testID,
  label,
  value,
  onChange,
}: {
  readonly testID: string;
  readonly label: string;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(() =>
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '',
  );
  return (
    <AuthTextField
      testID={testID}
      label={label}
      value={text}
      onChangeText={(next) => {
        setText(next);
        const trimmed = next.trim().replace(',', '.');
        const number = Number(trimmed);
        onChange(trimmed.length === 0 ? '' : Number.isFinite(number) ? number : next);
      }}
      keyboardType="decimal-pad"
    />
  );
}

function MetadataField({
  field,
  value,
  language,
  onChange,
}: {
  readonly field: ServiceMetadataFieldDefinition;
  readonly value: unknown;
  readonly language: SupportedLanguage;
  readonly onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation('services');
  const fontClass = useLanguageFontClass();
  const label = `${fieldLabel(field, language)}${field.required ? ' *' : ''}`;
  const testID = `service-metadata-${field.key}`;

  if (field.type === 'select' || field.type === 'string-array') {
    const selected =
      field.type === 'select'
        ? [typeof value === 'string' ? value : '']
        : Array.isArray(value)
          ? (value as readonly string[])
          : [];
    return (
      <View className="gap-xs" testID={testID}>
        <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
          {label}
        </Text>
        <View className="flex-row flex-wrap gap-sm">
          {(field.options ?? []).map((option) => (
            <ChoiceOption
              key={option}
              testID={`${testID}-${option}`}
              value={option}
              label={t(`option.${option}`)}
              selected={selected.includes(option)}
              onSelect={(picked) => {
                if (field.type === 'select') onChange(picked === value ? '' : picked);
                else
                  onChange(
                    selected.includes(picked)
                      ? selected.filter((current) => current !== picked)
                      : [...selected, picked],
                  );
              }}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>
    );
  }
  if (field.type === 'boolean') {
    return (
      <View className="flex-row items-center justify-between gap-md" testID={`${testID}-row`}>
        <Text className={`flex-1 text-start text-md text-neutral-800 ${fontClass}`}>{label}</Text>
        <Switch
          testID={testID}
          accessibilityLabel={label}
          value={value === true}
          onValueChange={onChange}
          trackColor={{ true: tokens.colors.primary.DEFAULT }}
        />
      </View>
    );
  }
  if (field.type === 'date') {
    return (
      <DateField
        testID={testID}
        label={label}
        value={typeof value === 'string' ? value : ''}
        onChange={onChange}
      />
    );
  }
  if (field.type === 'number') {
    return <NumberField testID={testID} label={label} value={value} onChange={onChange} />;
  }
  return (
    <AuthTextField
      testID={testID}
      label={label}
      value={typeof value === 'string' ? value : ''}
      onChangeText={onChange}
      maxLength={2_000}
      multiline
    />
  );
}

export function ServiceMetadataFields({
  fields,
  values,
  language,
  onChange,
}: {
  readonly fields: readonly ServiceMetadataFieldDefinition[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly language: SupportedLanguage;
  readonly onChange: (key: string, value: unknown) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <View className="gap-md" testID="service-metadata">
      {fields.map((field) => (
        <MetadataField
          key={field.key}
          field={field}
          value={values[field.key]}
          language={language}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </View>
  );
}
