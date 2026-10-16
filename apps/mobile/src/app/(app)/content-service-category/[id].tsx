/**
 * Adding or changing a service category on the phone (RAPP-347), for
 * `services.edit` holders: the Catalan name with its translations, the slug,
 * an icon and a colour, and the category's own fields, one card each, with
 * Move up, Move down, Edit (in a sheet) and Remove. Saving an edit first asks
 * the database how many stored services the new fields would make invalid, as
 * the web admin does, and stops with that count.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { MultilingualField } from '@/components/content/multilingual-field';
import { ServiceFieldSheet } from '@/components/content/service-field-sheet';
import {
  SERVICE_FIELD_TYPE_KEYS,
  SERVICE_ICON_KEYS,
  SERVICE_ICON_SYMBOLS,
} from '@/components/content/service-labels';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { eventCategoryColor } from '@/components/events/event-card';
import { PressableScale } from '@/components/motion/pressable-scale';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { useContentServiceCategories, useServiceCategoryActions } from '@/lib/content-services';
import { reviewHandlers, reviewOptions } from '@/lib/content-translations';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import {
  emptyField,
  fieldKey,
  isCategoryInputValid,
  isFieldValid,
  moveField,
  SERVICE_CATEGORY_COLORS,
  SERVICE_CATEGORY_ICONS,
  slugFromName,
  startingCategoryForm,
  toCategoryInput,
  type CategoryForm,
  type FormField,
} from '@/lib/service-category-form';
import { generateDrafts } from '@/lib/translation-worker';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessageKey, toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import type { EventCategoryColor } from '@ramassa/shared/events';
import type { AdminServiceCategory } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';
import {
  isTranslationReviewPublishable,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';

const COLOR_KEYS = {
  primary: 'colorPrimary',
  secondary: 'colorSecondary',
  accent: 'colorAccent',
  'chart-1': 'colorChart1',
  'chart-2': 'colorChart2',
  'chart-3': 'colorChart3',
} as const satisfies Record<(typeof SERVICE_CATEGORY_COLORS)[number], string>;

type FormError = AppErrorCode | 'invalid' | 'name' | { readonly incompatible: number };

/** The fixed choices, plus a stored value outside them, so an edit never changes it unseen. */
function withStored<T extends string>(choices: readonly T[], stored: string): readonly string[] {
  return (choices as readonly string[]).includes(stored) ? choices : [...choices, stored];
}

function SectionLabel({ children }: { readonly children: string }) {
  const fontClass = useLanguageFontClass();
  return (
    <Text className={`text-start text-md font-medium text-neutral-800 ${fontClass}`}>
      {children}
    </Text>
  );
}

function CategoryEditor({ category }: { readonly category: AdminServiceCategory | undefined }) {
  const { t } = useTranslation('services');
  const { t: tEvents } = useTranslation('events');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { back } = useRouter();
  const { save } = useServiceCategoryActions();
  const [form, setForm] = useState<CategoryForm>(() => startingCategoryForm(category));
  const [isSlugTouched, setIsSlugTouched] = useState(category !== undefined);
  const [fieldReviews, setFieldReviews] = useState<Record<string, TranslationReview | undefined>>(
    {},
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const nameReview = useTranslationReview(
    category === undefined ? undefined : reviewOptions(category.name.ca, { ...category.name }),
  );
  const set = (patch: Partial<CategoryForm>) => setForm((current) => ({ ...current, ...patch }));
  const editing = form.fields.find((field) => field.id === editingId) ?? null;

  const generate = async () => {
    setError(null);
    setIsGenerating(true);
    const failure = await generateDrafts([{ source: form.name, start: nameReview.start }]);
    setIsGenerating(false);
    if (failure !== null) setError(failure);
  };

  const submit = () => {
    setError(null);
    if (nameReview.review === undefined || !isTranslationReviewPublishable(nameReview.review)) {
      setError('name');
      playHaptic('warning');
      return;
    }
    const values = toCategoryInput(form, { name: nameReview.review, fields: fieldReviews });
    if (!isCategoryInputValid(values)) {
      setError('invalid');
      playHaptic('warning');
      return;
    }
    save.mutate(
      { id: category?.id ?? null, values },
      {
        onSuccess: (result) => {
          if (result.kind === 'incompatible') {
            setError({ incompatible: result.count });
            playHaptic('warning');
            return;
          }
          playHaptic('success');
          back();
        },
        onError: (failure) => {
          setError(toAppError(failure).code);
          playHaptic('error');
        },
      },
    );
  };

  const errorMessage =
    error === null
      ? null
      : typeof error === 'object'
        ? t('categorySchemaWarning', { count: error.incompatible })
        : error === 'name'
          ? tEvents('categoryTranslationRequired')
          : error === 'invalid'
            ? t('categoryInvalidPhone')
            : tErrors(getErrorMessageKey(error));

  return (
    <WizardFrame
      title={category === undefined ? t('newCategory') : t('editCategory')}
      continueLabel={t('categorySave')}
      onContinue={submit}
      isContinueBusy={save.isPending}
      onBack={back}
    >
      <MultilingualField
        testIDPrefix="service-category-name"
        label={t('categoryName')}
        value={form.name}
        onChangeText={(name) => {
          set(isSlugTouched ? { name } : { name, slug: slugFromName(name) });
          nameReview.reset();
        }}
        maxLength={200}
        {...reviewHandlers(nameReview, () => undefined)}
      />
      <PressableScale
        testID="service-category-generate"
        accessibilityRole="button"
        accessibilityLabel={t('generateTranslations')}
        onPress={() => void generate()}
        isBusy={isGenerating}
        isDisabled={form.name.trim().length === 0}
        haptic="tapLight"
        className="min-h-recommended items-center justify-center rounded-md border border-primary bg-white px-lg"
      >
        <Text className={`text-center text-md font-bold text-primary-dark ${fontClass}`}>
          {isGenerating ? t('generatingTranslations') : t('generateTranslations')}
        </Text>
      </PressableScale>
      <AuthTextField
        testID="service-category-slug"
        label={t('categorySlug')}
        value={form.slug}
        onChangeText={(slug) => {
          setIsSlugTouched(true);
          set({ slug });
        }}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View className="gap-xs">
        <SectionLabel>{t('categoryIcon')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {withStored(SERVICE_CATEGORY_ICONS, form.icon).map((icon) => {
            const symbol = SERVICE_ICON_SYMBOLS[icon as keyof typeof SERVICE_ICON_SYMBOLS];
            const key = SERVICE_ICON_KEYS[icon as keyof typeof SERVICE_ICON_KEYS];
            return (
              <View key={icon} className="flex-row items-center gap-xs">
                {symbol === undefined ? null : (
                  <SymbolView name={symbol} size={18} tintColor={tokens.colors.primary.DEFAULT} />
                )}
                <ChoiceOption
                  testID={`service-category-icon-${icon}`}
                  value={icon}
                  label={key === undefined ? icon : t(key)}
                  selected={icon === form.icon}
                  onSelect={(value) => set({ icon: value })}
                  languageFontClass={fontClass}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View className="gap-xs">
        <SectionLabel>{t('categoryColor')}</SectionLabel>
        <View className="flex-row flex-wrap gap-sm">
          {withStored(SERVICE_CATEGORY_COLORS, form.color).map((color) => {
            const key = COLOR_KEYS[color as keyof typeof COLOR_KEYS];
            return (
              <View key={color} className="flex-row items-center gap-xs">
                {key === undefined ? null : (
                  <View
                    accessible={false}
                    className="h-md w-md rounded-full"
                    style={{ backgroundColor: eventCategoryColor(color as EventCategoryColor) }}
                  />
                )}
                <ChoiceOption
                  testID={`service-category-color-${color}`}
                  value={color}
                  label={key === undefined ? color : tEvents(key)}
                  selected={color === form.color}
                  onSelect={(value) => set({ color: value })}
                  languageFontClass={fontClass}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View className="gap-sm" testID="service-category-fields">
        <SectionLabel>{t('fieldsTitle')}</SectionLabel>
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('fieldsHelp')}
        </Text>
        {form.fields.map((field, index) => (
          <FieldCard
            key={field.id}
            field={field}
            index={index}
            count={form.fields.length}
            isValid={isFieldValid(field, fieldReviews[field.id])}
            onEdit={() => setEditingId(field.id)}
            onMove={(offset) => set({ fields: moveField(form.fields, index, offset) })}
            onRemove={() => set({ fields: form.fields.filter((item) => item.id !== field.id) })}
          />
        ))}
        <PressableScale
          testID="service-category-field-add"
          accessibilityRole="button"
          accessibilityLabel={t('fieldAdd')}
          onPress={() => {
            const field = emptyField();
            set({ fields: [...form.fields, field] });
            setEditingId(field.id);
          }}
          haptic="tapLight"
          className="min-h-recommended justify-center self-start"
        >
          <Text className={`font-semibold text-primary-dark ${fontClass}`}>{t('fieldAdd')}</Text>
        </PressableScale>
      </View>

      {error === null || errorMessage === null ? null : (
        <FailureNotice
          code={
            typeof error === 'string' && error !== 'invalid' && error !== 'name'
              ? error
              : 'VALIDATION-1'
          }
          message={errorMessage}
        />
      )}

      <ServiceFieldSheet
        field={editing}
        review={editing === null ? undefined : fieldReviews[editing.id]}
        onDone={(field, review) => {
          set({ fields: form.fields.map((item) => (item.id === field.id ? field : item)) });
          setFieldReviews((current) => ({ ...current, [field.id]: review }));
          setEditingId(null);
        }}
        onCancel={() => setEditingId(null)}
      />
    </WizardFrame>
  );
}

function FieldCard({
  field,
  index,
  count,
  isValid,
  onEdit,
  onMove,
  onRemove,
}: {
  readonly field: FormField;
  readonly index: number;
  readonly count: number;
  readonly isValid: boolean;
  readonly onEdit: () => void;
  readonly onMove: (offset: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  const { t } = useTranslation('services');
  const fontClass = useLanguageFontClass();
  const action = (
    testID: string,
    label: string,
    onPress: () => void,
    isDisabled = false,
    isDestructive = false,
  ) => (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      isDisabled={isDisabled}
      haptic="tapLight"
      className="min-h-recommended justify-center px-xs"
    >
      <Text
        className={`font-semibold ${
          isDisabled ? 'text-neutral-400' : isDestructive ? 'text-error' : 'text-primary-dark'
        } ${fontClass}`}
      >
        {label}
      </Text>
    </PressableScale>
  );
  return (
    <View
      testID={`service-category-field-${index}`}
      style={continuousCorners}
      className="gap-xs rounded-md border border-neutral-200 bg-white px-md py-sm"
    >
      <Text className={`text-start text-md font-bold text-neutral-900 ${fontClass}`}>
        {field.label.trim() || t('fieldNew')}
      </Text>
      <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
        {[
          fieldKey(field) || null,
          t(SERVICE_FIELD_TYPE_KEYS[field.type]),
          field.required ? t('fieldRequired') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {isValid ? null : (
        <Text
          testID={`service-category-field-${index}-incomplete`}
          className={`text-start text-sm font-semibold text-error ${fontClass}`}
        >
          {t('fieldNeedsWork')}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-sm">
        {action(
          `service-category-field-${index}-up`,
          t('categoryMoveUp'),
          () => onMove(-1),
          index === 0,
        )}
        {action(
          `service-category-field-${index}-down`,
          t('categoryMoveDown'),
          () => onMove(1),
          index === count - 1,
        )}
        {action(`service-category-field-${index}-edit`, t('fieldEdit'), onEdit)}
        {action(`service-category-field-${index}-remove`, t('fieldRemove'), onRemove, false, true)}
      </View>
    </View>
  );
}

export default function ServiceCategoryScreen() {
  const { id = 'new' } = useLocalSearchParams<{ id: string }>();
  const categories = useContentServiceCategories();
  const { t } = useTranslation('services');
  if (categories.data === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        {categories.isError ? (
          <Text className="p-lg text-start text-md text-error">{t('loadFailed')}</Text>
        ) : (
          <AnnouncementFeedSkeleton accessibilityLabel={t('categoriesTitle')} />
        )}
      </SafeAreaView>
    );
  }
  const category = id === 'new' ? undefined : categories.data.find((item) => item.id === id);
  return <CategoryEditor key={id} category={category} />;
}
