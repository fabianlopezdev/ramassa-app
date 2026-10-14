/**
 * One extra field of a service category, edited on its own in a sheet
 * (RAPP-347): the Catalan name with its translations, the key services store
 * the answer under, the type, whether it is required and whether players can
 * filter by it, a select's options and a number's minimum. The native side of
 * one entry in the web admin's schema JSON.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { PressableScale } from '@/components/motion/pressable-scale';
import { continuousCorners } from '@/lib/continuous-corners';
import { fieldKey, keepsStoredLabel, type FormField } from '@/lib/service-category-form';
import { generateDrafts } from '@/lib/translation-worker';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

function FieldForm({
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
    <ScrollView
      contentContainerClassName="gap-md p-lg"
      keyboardShouldPersistTaps="handled"
      // The page sheet does not move with the keyboard, so the scroll view does.
      automaticallyAdjustKeyboardInsets
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
      >
        {field.isStored ? field.label : t('fieldNew')}
      </Text>
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
        <PressableScale
          testID="service-field-generate"
          accessibilityRole="button"
          accessibilityLabel={t('fieldLabelGenerate')}
          onPress={() => void generate()}
          isBusy={isGenerating}
          isDisabled={draft.label.trim().length === 0}
          haptic="tapLight"
          className="min-h-recommended items-center justify-center rounded-md border border-primary bg-white px-lg"
        >
          <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
            {isGenerating ? t('generatingTranslations') : t('fieldLabelGenerate')}
          </Text>
        </PressableScale>
      )}

      <View className="gap-xs">
        {draft.isStored ? (
          <View
            accessible
            accessibilityLabel={`${t('fieldKey')}: ${draft.key}`}
            testID="service-field-key-stored"
            className="gap-xs"
          >
            <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
              {t('fieldKey')}
            </Text>
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
        <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
          {t('fieldType')}
        </Text>
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
          <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
            {t('fieldOptions')}
          </Text>
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
        <PressableScale
          testID="service-field-done"
          accessibilityRole="button"
          accessibilityLabel={t('fieldDone')}
          onPress={() => onDone(draft, review)}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md bg-primary px-lg"
        >
          <Text className={`text-center text-md font-bold text-white ${fontClass}`}>
            {t('fieldDone')}
          </Text>
        </PressableScale>
        <PressableScale
          testID="service-field-cancel"
          accessibilityRole="button"
          accessibilityLabel={t('categoryCancel')}
          onPress={onCancel}
          haptic="tapLight"
          style={continuousCorners}
          className="min-h-recommended items-center justify-center rounded-md border border-neutral-300 bg-white px-lg"
        >
          <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
            {t('categoryCancel')}
          </Text>
        </PressableScale>
      </View>
    </ScrollView>
  );
}

export function ServiceFieldSheet({
  field,
  review,
  onDone,
  onCancel,
}: {
  /** The field being edited, or null when the sheet is closed. */
  readonly field: FormField | null;
  readonly review: TranslationReview | undefined;
  readonly onDone: (field: FormField, review: TranslationReview | undefined) => void;
  readonly onCancel: () => void;
}) {
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  return (
    <Modal
      visible={field !== null && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView className="flex-1 bg-white" testID="service-field-sheet">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          {field === null ? null : (
            <FieldForm
              key={field.id}
              field={field}
              initialReview={review}
              onDone={onDone}
              onCancel={onCancel}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
