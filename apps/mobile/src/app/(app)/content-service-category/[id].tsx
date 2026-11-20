/**
 * Adding or changing a service category on the phone (RAPP-347), for
 * `services.edit` holders: the Catalan name with its translations, the slug,
 * an icon and a colour, and the category's own fields, one card each, with
 * Move up, Move down, Edit and Remove. Edit opens the field inside its card
 * (RAPP-800), so the editor is the deepest level. Saving an edit first asks
 * the database how many stored services the new fields would make invalid, as
 * the web admin does, and stops with that count.
 */
import { AnnouncementFeedSkeleton } from '@/components/announcements/feed-states';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { MultilingualField } from '@/components/content/multilingual-field';
import { ServiceFieldForm } from '@/components/content/service-field-form';
import {
  SERVICE_FIELD_TYPE_KEYS,
  SERVICE_ICON_KEYS,
  SERVICE_ICON_NAMES,
} from '@/components/content/service-labels';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { FieldLabel } from '@/components/forms/field-label';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { Icon } from '@/components/icons/icon';
import { PressableScale } from '@/components/motion/pressable-scale';
import { WizardFrame } from '@/components/onboarding/wizard-frame';
import { useContentServiceCategories, useServiceCategoryActions } from '@/lib/content-services';
import { reviewHandlers, reviewOptions } from '@/lib/content-translations';
import { continuousCorners } from '@/lib/continuous-corners';
import { playHaptic } from '@/lib/haptics/haptics';
import {
  CATEGORY_COLORS,
  emptyField,
  fieldKey,
  isCategoryInputValid,
  isFieldValid,
  moveField,
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
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { categoryHue, isCategoryColor, type CategoryColor } from '@ramassa/shared/category-colors';
import { getErrorMessageKey, toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import { type AdminServiceCategory } from '@ramassa/shared/services';
import { tokens } from '@ramassa/shared/tokens';
import {
  isTranslationReviewPublishable,
  type TranslationReview,
} from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';

// The label of each category hue (RAPP-856), in the services namespace.
const COLOR_KEYS = {
  sky: 'categoryColorSky',
  green: 'categoryColorGreen',
  purple: 'categoryColorPurple',
  orange: 'categoryColorOrange',
  pink: 'categoryColorPink',
  teal: 'categoryColorTeal',
  amber: 'categoryColorAmber',
  indigo: 'categoryColorIndigo',
} as const satisfies Record<CategoryColor, string>;

type FormError =
  AppErrorCode | 'invalid' | 'name' | 'fieldOpen' | { readonly incompatible: number };

/** The fixed choices, plus a stored value outside them, so an edit never changes it unseen. */
function withStored<T extends string>(choices: readonly T[], stored: string): readonly string[] {
  return (choices as readonly string[]).includes(stored) ? choices : [...choices, stored];
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

  const generate = async () => {
    setError(null);
    setIsGenerating(true);
    const failure = await generateDrafts([{ source: form.name, start: nameReview.start }]);
    setIsGenerating(false);
    if (failure !== null) setError(failure);
  };

  const submit = () => {
    setError(null);
    // A field still open has changes the category does not hold yet.
    if (editingId !== null) {
      setError('fieldOpen');
      playHaptic('warning');
      return;
    }
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
            : error === 'fieldOpen'
              ? t('fieldStillOpen')
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
      <RaisedActionButton
        testID="service-category-generate"
        label={isGenerating ? t('generatingTranslations') : t('generateTranslations')}
        accessibilityLabel={t('generateTranslations')}
        onPress={() => void generate()}
        isDisabled={form.name.trim().length === 0 || isGenerating}
      />
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
        <FieldLabel>{t('categoryIcon')}</FieldLabel>
        <View className="flex-row flex-wrap gap-sm">
          {withStored(SERVICE_CATEGORY_ICONS, form.icon).map((icon) => {
            const symbol = SERVICE_ICON_NAMES[icon as keyof typeof SERVICE_ICON_NAMES];
            const key = SERVICE_ICON_KEYS[icon as keyof typeof SERVICE_ICON_KEYS];
            return (
              <View key={icon} className="flex-row items-center gap-xs">
                {symbol === undefined ? null : (
                  <Icon
                    name={symbol}
                    weight="boldDuotone"
                    size={tokens.fontSize.lg}
                    color={tokens.colors.primary.DEFAULT}
                  />
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
        <FieldLabel>{t('categoryColor')}</FieldLabel>
        <View className="flex-row flex-wrap gap-sm">
          {withStored(CATEGORY_COLORS, form.color).map((color) => {
            const key = isCategoryColor(color) ? COLOR_KEYS[color] : undefined;
            const hue = categoryHue(color);
            return (
              <View key={color} className="flex-row items-center gap-xs">
                {hue === undefined ? null : (
                  <View
                    accessible={false}
                    className="h-md w-md rounded-full"
                    style={{ backgroundColor: hue }}
                  />
                )}
                <ChoiceOption
                  testID={`service-category-color-${color}`}
                  value={color}
                  label={key === undefined ? color : t(key)}
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
        <FieldLabel>{t('fieldsTitle')}</FieldLabel>
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
            isLocked={editingId !== null && editingId !== field.id}
            onEdit={() => setEditingId(field.id)}
            onMove={(offset) => set({ fields: moveField(form.fields, index, offset) })}
            onRemove={() => set({ fields: form.fields.filter((item) => item.id !== field.id) })}
          >
            {editingId === field.id ? (
              <ServiceFieldForm
                field={field}
                initialReview={fieldReviews[field.id]}
                onDone={(done, review) => {
                  set({
                    fields: form.fields.map((item) => (item.id === done.id ? done : item)),
                  });
                  setFieldReviews((current) => ({ ...current, [done.id]: review }));
                  setEditingId(null);
                }}
                onCancel={() => {
                  // A new field cancelled before its first Done goes away again.
                  if (!field.isStored && field.label.trim().length === 0) {
                    set({ fields: form.fields.filter((item) => item.id !== field.id) });
                  }
                  setEditingId(null);
                }}
              />
            ) : null}
          </FieldCard>
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
          isDisabled={editingId !== null}
          haptic="tapLight"
          className="min-h-recommended justify-center self-start"
        >
          <Text
            className={`font-semibold ${editingId === null ? 'text-primary-dark' : 'text-neutral-400'} ${fontClass}`}
          >
            {t('fieldAdd')}
          </Text>
        </PressableScale>
      </View>

      {error === null || errorMessage === null ? null : (
        <FailureNotice
          code={
            typeof error === 'string' &&
            error !== 'invalid' &&
            error !== 'name' &&
            error !== 'fieldOpen'
              ? error
              : 'VALIDATION-1'
          }
          message={errorMessage}
        />
      )}
    </WizardFrame>
  );
}

function FieldCard({
  field,
  index,
  count,
  isValid,
  isLocked,
  onEdit,
  onMove,
  onRemove,
  children,
}: {
  readonly field: FormField;
  readonly index: number;
  readonly count: number;
  readonly isValid: boolean;
  /** Another field is open, so this card waits. */
  readonly isLocked: boolean;
  readonly onEdit: () => void;
  readonly onMove: (offset: -1 | 1) => void;
  readonly onRemove: () => void;
  /** The open field's form, shown inside the card in place of its actions. */
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation('services');
  const isEditing = children !== undefined && children !== null;
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
      {isEditing ? (
        children
      ) : (
        <View className="flex-row flex-wrap gap-sm">
          {action(
            `service-category-field-${index}-up`,
            t('categoryMoveUp'),
            () => onMove(-1),
            isLocked || index === 0,
          )}
          {action(
            `service-category-field-${index}-down`,
            t('categoryMoveDown'),
            () => onMove(1),
            isLocked || index === count - 1,
          )}
          {action(`service-category-field-${index}-edit`, t('fieldEdit'), onEdit, isLocked)}
          {action(
            `service-category-field-${index}-remove`,
            t('fieldRemove'),
            onRemove,
            isLocked,
            true,
          )}
        </View>
      )}
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
