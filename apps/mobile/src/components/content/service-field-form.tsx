/**
 * One extra field of a service category (RAPP-347), edited inside its card in
 * the category editor (RAPP-800), so no further screen or sheet opens: the
 * Catalan name with its translations, the key services store
 * the answer under, the type, whether it is required and whether players can
 * filter by it, a select's options and a number's minimum. The native side of
 * one entry in the web admin's schema JSON.
 */
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { FieldLabel } from '@/components/forms/field-label';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { PressableScale } from '@/components/motion/pressable-scale';
import { fieldKey, keepsStoredLabel, type FormField } from '@/lib/service-category-form';
import { generateDrafts } from '@/lib/translation-worker';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, Text, View } from 'react-native';
import { getErrorMessageKey, type AppErrorCode } from '@ramassa/shared/errors';
import { SERVICE_METADATA_FIELD_TYPES } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';
import {
  approveTranslation,
  createTranslationReview,
  editTranslationDraft,
  rejectTranslation,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { MultilingualField } from './multilingual-field';
import { SERVICE_FIELD_TYPE_KEYS } from './service-labels';

function Toggle({
  testID,
  label,
  value,
  onChange,
}: {
  readonly testID: string;
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  const fontClass = useLanguageFontClass();
  return (
    <View className="flex-row items-center justify-between gap-md">
      <Text className={`flex-1 text-start text-md text-neutral-800 ${fontClass}`}>{label}</Text>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: tokens.colors.primary.DEFAULT }}
      />
    </View>
  );
}

export function ServiceFieldForm({
  field,
  initialReview,
  onDone,
  onCancel,
}: {
  readonly field: FormField;
  readonly initialReview: TranslationReview | undefined;
  readonly onDone: (field: FormField, review: TranslationReview | undefined) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation('services');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const [draft, setDraft] = useState(field);
  const [review, setReview] = useState(initialReview);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const set = (patch: Partial<FormField>) => setDraft((current) => ({ ...current, ...patch }));
  const change = (next: (current: TranslationReview) => TranslationReview) =>
    setReview((current) => (current === undefined ? current : next(current)));
  const usesOptions = draft.type === 'select' || draft.type === 'string-array';

  const generate = async () => {
    setErrorCode(null);
    setIsGenerating(true);
    const failure = await generateDrafts([
      { source: draft.label, start: (options) => setReview(createTranslationReview(options)) },
    ]);
    setIsGenerating(false);
    if (failure !== null) setErrorCode(failure);
  };

  return (
    <View testID="service-field-form" className="gap-md border-t border-neutral-200 pt-md">
      <MultilingualField
        testIDPrefix="service-field-label"
        label={t('fieldLabel')}
        value={draft.label}
        onChangeText={(label) => {
          set({ label });
          setReview(undefined);
        }}
        maxLength={200}
        review={review}
        onEdit={(language, text) => change((r) => editTranslationDraft(r, language, text))}
        onApprove={(language) => change((r) => approveTranslation(r, language))}
        onReject={(language) => change((r) => rejectTranslation(r, language))}
        onApproveAll={() =>
          change((r) => r.suggestions.reduce((next, s) => approveTranslation(next, s.language), r))
        }
      />
      {keepsStoredLabel(draft) && review === undefined ? null : (
        <RaisedActionButton
          testID="service-field-generate"
          label={isGenerating ? t('generatingTranslations') : t('fieldLabelGenerate')}
          accessibilityLabel={t('fieldLabelGenerate')}
          onPress={() => void generate()}
          isDisabled={draft.label.trim().length === 0 || isGenerating}
        />
      )}

      <View className="gap-xs">
        {draft.isStored ? (
          <View
            accessible
            accessibilityLabel={`${t('fieldKey')}: ${draft.key}`}
            testID="service-field-key-stored"
            className="gap-xs"
          >
            <FieldLabel>{t('fieldKey')}</FieldLabel>
            <Text selectable className={`text-start text-md text-neutral-900 ${fontClass}`}>
              {draft.key}
            </Text>
          </View>
        ) : (
          <AuthTextField
            testID="service-field-key"
            label={t('fieldKey')}
            value={draft.key}
            placeholder={fieldKey(draft)}
            onChangeText={(key) => set({ key })}
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('fieldKeyHelp')}
        </Text>
      </View>

      <View className="gap-xs">
        <FieldLabel>{t('fieldType')}</FieldLabel>
        <View className="flex-row flex-wrap gap-sm">
          {SERVICE_METADATA_FIELD_TYPES.map((type) => (
            <ChoiceOption
              key={type}
              testID={`service-field-type-${type}`}
              value={type}
              label={t(SERVICE_FIELD_TYPE_KEYS[type])}
              selected={type === draft.type}
              onSelect={(value) => set({ type: value })}
              languageFontClass={fontClass}
            />
          ))}
        </View>
      </View>
      <Toggle
        testID="service-field-required"
        label={t('fieldRequired')}
        value={draft.required}
        onChange={(required) => set({ required })}
      />
      <Toggle
        testID="service-field-filterable"
        label={t('fieldFilterable')}
        value={draft.filterable}
        onChange={(filterable) => set({ filterable })}
      />

      {usesOptions ? (
        <View className="gap-sm" testID="service-field-options">
          <FieldLabel>{t('fieldOptions')}</FieldLabel>
          <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
            {t('fieldOptionsHelp')}
          </Text>
          {draft.options.map((option, index) => (
            <View key={index} className="gap-xs">
              <AuthTextField
                testID={`service-field-option-${index}`}
                label={t('fieldOption', { number: index + 1 })}
                value={option}
                onChangeText={(text) =>
                  set({
                    options: draft.options.map((current, position) =>
                      position === index ? text : current,
                    ),
                  })
                }
                autoCapitalize="none"
                autoCorrect={false}
              />
              <PressableScale
                testID={`service-field-option-remove-${index}`}
                accessibilityRole="button"
                accessibilityLabel={t('fieldOptionRemove')}
                onPress={() =>
                  set({ options: draft.options.filter((_option, position) => position !== index) })
                }
                haptic="tapLight"
                className="min-h-recommended justify-center self-start"
              >
                <Text className={`font-semibold text-error ${fontClass}`}>
                  {t('fieldOptionRemove')}
                </Text>
              </PressableScale>
            </View>
          ))}
          <PressableScale
            testID="service-field-option-add"
            accessibilityRole="button"
            accessibilityLabel={t('fieldOptionAdd')}
            onPress={() => set({ options: [...draft.options, ''] })}
            haptic="tapLight"
            className="min-h-recommended justify-center self-start"
          >
            <Text className={`font-semibold text-primary-dark ${fontClass}`}>
              {t('fieldOptionAdd')}
            </Text>
          </PressableScale>
        </View>
      ) : null}
      {draft.type === 'number' ? (
        <AuthTextField
          testID="service-field-minimum"
          label={t('fieldMinimum')}
          value={draft.minimum}
          onChangeText={(minimum) => set({ minimum })}
          keyboardType="numbers-and-punctuation"
        />
      ) : null}

      {errorCode === null ? null : (
        <FailureNotice code={errorCode} message={tErrors(getErrorMessageKey(errorCode))} />
      )}
      <View className="flex-row flex-wrap gap-sm">
        <AuthSubmitButton
          testID="service-field-done"
          label={t('fieldDone')}
          onPress={() => onDone(draft, review)}
        />
        <RaisedActionButton
          testID="service-field-cancel"
          label={t('categoryCancel')}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}
