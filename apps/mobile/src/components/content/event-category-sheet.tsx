/**
 * Adding or changing an event category on the phone (RAPP-342), in a sheet:
 * the Catalan name with its four translations, which must all be approved,
 * as the database stores every language; an icon; and a colour. The web
 * admin's category form, field for field.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { ChoiceOption } from '@/components/equipment/choice-option';
import { FailureNotice } from '@/components/error-code-line';
import { eventCategoryColor } from '@/components/events/event-card';
import { FieldLabel } from '@/components/forms/field-label';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { screenContentClassName } from '@/components/layout/screen-spacing';
import { NativeModalScope } from '@/components/motion/native-modal-scope';
import { useEventCategoryActions } from '@/lib/content-events';
import { reviewHandlers, reviewOptions } from '@/lib/content-translations';
import { playHaptic } from '@/lib/haptics/haptics';
import { generateDrafts } from '@/lib/translation-worker';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import { getErrorMessageKey, toAppError, type AppErrorCode } from '@ramassa/shared/errors';
import {
  EVENT_CATEGORY_COLORS,
  EVENT_CATEGORY_ICONS,
  eventCategoryInputSchema,
  MAX_EVENT_TITLE_LENGTH,
  type EventCategoryColor,
  type EventCategoryIcon,
  type EventCategoryRow,
} from '@ramassa/shared/events';
import { isTranslationReviewPublishable } from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';
import { EventCategoryGlyph } from './event-category-badge';
import { EVENT_COLOR_KEYS, EVENT_ICON_KEYS } from './event-labels';
import { MultilingualField } from './multilingual-field';

function CategoryForm({
  category,
  onClose,
}: {
  readonly category: EventCategoryRow | null;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('events');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { save } = useEventCategoryActions();
  const [name, setName] = useState(category?.name.ca ?? '');
  const [icon, setIcon] = useState<EventCategoryIcon>(category?.icon ?? 'dumbbell');
  const [color, setColor] = useState<EventCategoryColor>(category?.color ?? 'primary');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const nameReview = useTranslationReview(
    category === null ? undefined : reviewOptions(category.name.ca, category.name),
  );
  const noop = () => undefined;

  const generate = async () => {
    setErrorCode(null);
    setIsGenerating(true);
    const failure = await generateDrafts([{ source: name, start: nameReview.start }]);
    setIsGenerating(false);
    if (failure !== null) setErrorCode(failure);
  };

  const submit = () => {
    setErrorCode(null);
    const parsed =
      nameReview.review !== undefined && isTranslationReviewPublishable(nameReview.review)
        ? eventCategoryInputSchema.safeParse({
            name: localizedTextFromReview(name, nameReview.review),
            icon,
            color,
          })
        : null;
    if (parsed === null || !parsed.success) {
      setErrorCode('TRANSLATION-4');
      playHaptic('warning');
      return;
    }
    save.mutate(
      { id: category?.id ?? null, values: parsed.data },
      {
        onSuccess: () => {
          playHaptic('success');
          onClose();
        },
        onError: () => playHaptic('error'),
      },
    );
  };

  const shownError = errorCode ?? (save.isError ? toAppError(save.error).code : null);

  return (
    <ScrollView
      contentContainerClassName={screenContentClassName}
      keyboardShouldPersistTaps="handled"
      // The page sheet does not move with the keyboard, so the scroll view does.
      automaticallyAdjustKeyboardInsets
    >
      <Text
        accessibilityRole="header"
        className={`text-start text-2xl font-bold text-neutral-900 ${fontClass}`}
      >
        {category === null ? t('newCategory') : t('editCategory')}
      </Text>
      <MultilingualField
        testIDPrefix="category-name"
        label={t('categoryName')}
        value={name}
        onChangeText={(value) => {
          setName(value);
          nameReview.reset();
        }}
        maxLength={MAX_EVENT_TITLE_LENGTH}
        {...reviewHandlers(nameReview, noop)}
      />
      <RaisedActionButton
        testID="category-generate"
        label={isGenerating ? t('generatingTranslations') : t('categoryGenerate')}
        onPress={() => void generate()}
        isDisabled={name.trim().length === 0 || isGenerating}
      />

      <View className="gap-xs">
        <FieldLabel>{t('categoryIcon')}</FieldLabel>
        <View className="flex-row flex-wrap gap-sm">
          {EVENT_CATEGORY_ICONS.map((candidate) => (
            <View key={candidate} className="flex-row items-center gap-xs">
              <EventCategoryGlyph category={{ icon: candidate, color }} />
              <ChoiceOption
                testID={`category-icon-${candidate}`}
                value={candidate}
                label={t(EVENT_ICON_KEYS[candidate])}
                selected={candidate === icon}
                onSelect={setIcon}
                languageFontClass={fontClass}
              />
            </View>
          ))}
        </View>
      </View>
      <View className="gap-xs">
        <FieldLabel>{t('categoryColor')}</FieldLabel>
        <View className="flex-row flex-wrap gap-sm">
          {EVENT_CATEGORY_COLORS.map((candidate) => (
            <View key={candidate} className="flex-row items-center gap-xs">
              <View
                accessible={false}
                className="h-md w-md rounded-full"
                style={{ backgroundColor: eventCategoryColor(candidate) }}
              />
              <ChoiceOption
                testID={`category-color-${candidate}`}
                value={candidate}
                label={t(EVENT_COLOR_KEYS[candidate])}
                selected={candidate === color}
                onSelect={setColor}
                languageFontClass={fontClass}
              />
            </View>
          ))}
        </View>
      </View>

      {shownError === null ? null : (
        <FailureNotice
          code={shownError}
          message={
            shownError === 'TRANSLATION-4'
              ? t('categoryTranslationRequired')
              : tErrors(getErrorMessageKey(shownError))
          }
        />
      )}
      <View className="flex-row flex-wrap gap-sm">
        <AuthSubmitButton
          testID="category-save"
          label={t('categorySave')}
          onPress={submit}
          isLoading={save.isPending}
        />
        <RaisedActionButton
          testID="category-cancel"
          label={t('categoryCancel')}
          onPress={onClose}
        />
      </View>
    </ScrollView>
  );
}

export function EventCategorySheet({
  visible,
  category,
  onClose,
}: {
  readonly visible: boolean;
  /** The category to change, or null for a new one. */
  readonly category: EventCategoryRow | null;
  readonly onClose: () => void;
}) {
  // A native Modal sits above the app lock's cover, so it hides while locked.
  const { isCovered } = useAppLock();
  return (
    <Modal
      visible={visible && !isCovered}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <NativeModalScope>
        <SafeAreaView className="flex-1 bg-white" testID="event-category-sheet">
          <KeyboardAvoidingView
            className="flex-1"
            behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
          >
            {visible ? (
              <CategoryForm key={category?.id ?? 'new'} category={category} onClose={onClose} />
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </NativeModalScope>
    </Modal>
  );
}
