/**
 * Adding or changing a forum category on the phone (RAPP-386), in a sheet, as
 * the web admin's category form: the name in five languages, the identifier,
 * the icon and the colour, chosen from the shared section colours
 * (RAPP-893). The name is written in Catalan and its four translations
 * are generated and approved, as for event categories, where the web form
 * asks for the five names by hand. A new category's identifier follows the
 * Catalan name until it is changed by hand.
 */
import { useAppLock } from '@/components/auth/app-lock';
import { AuthSubmitButton } from '@/components/auth/auth-submit-button';
import { AuthTextField } from '@/components/auth/auth-text-field';
import { MultilingualField } from '@/components/content/multilingual-field';
import { SectionColorPicker } from '@/components/content/section-color-picker';
import { FailureNotice } from '@/components/error-code-line';
import { RaisedActionButton } from '@/components/forms/raised-action-button';
import { reviewHandlers, reviewOptions } from '@/lib/content-translations';
import { FORUM_CATEGORY_SLUG, forumCategorySlug } from '@/lib/forum-category-slug';
import { playHaptic } from '@/lib/haptics/haptics';
import { useForumCategoryActions } from '@/lib/team-forum';
import { generateDrafts } from '@/lib/translation-worker';
import { useLanguageFontClass } from '@/lib/use-language-font-class';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import { getErrorMessageKey, type AppErrorCode } from '@ramassa/shared/errors';
import type { ForumCategoryRow } from '@ramassa/shared/forum';
import { SECTION_COLOR_CHOICES } from '@ramassa/shared/section-colors';
import { useTranslationReview } from '@ramassa/shared/translation/react';

const NAME_MAX = 80;
const FIELD_MAX = 64;
const NEW_ICON = 'bubble';
// The stored name of a category with no colour (RAPP-893), where a new one starts.
const NO_COLOR = 'neutral';

type Notice = 'translations' | 'slug' | 'saveFailed' | AppErrorCode | null;

function CategoryForm({
  category,
  nextSortOrder,
  onClose,
}: {
  readonly category: ForumCategoryRow | null;
  readonly nextSortOrder: number;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation('forum');
  const { t: tEvents } = useTranslation('events');
  const { t: tErrors } = useTranslation('errors');
  const fontClass = useLanguageFontClass();
  const { save } = useForumCategoryActions();
  const [name, setName] = useState(category?.name.ca ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [isSlugEdited, setIsSlugEdited] = useState(category !== null);
  const [icon, setIcon] = useState(category?.icon ?? NEW_ICON);
  const [color, setColor] = useState(category?.color ?? NO_COLOR);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const nameReview = useTranslationReview(
    category === null ? undefined : reviewOptions(category.name.ca ?? '', category.name),
  );
  const touch = () => setNotice(null);

  const generate = async () => {
    touch();
    setIsGenerating(true);
    const failure = await generateDrafts([{ source: name, start: nameReview.start }]);
    setIsGenerating(false);
    if (failure !== null) setNotice(failure);
  };

  const submit = () => {
    touch();
    const copy = localizedTextFromReview(name, nameReview.review);
    if (!nameReview.isPublishable) {
      setNotice('translations');
      playHaptic('warning');
      return;
    }
    if (!FORUM_CATEGORY_SLUG.test(slug.trim())) {
      setNotice('slug');
      playHaptic('warning');
      return;
    }
    save.mutate(
      {
        id: category?.id ?? null,
        name: {
          ca: copy.ca,
          es: copy.es ?? '',
          en: copy.en ?? '',
          fr: copy.fr ?? '',
          ar: copy.ar ?? '',
          fa: copy.fa ?? '',
        },
        slug: slug.trim(),
        icon: icon.trim(),
        color,
        sortOrder: category?.sort_order ?? nextSortOrder,
      },
      {
        onSuccess: () => {
          playHaptic('success');
          onClose();
        },
        onError: () => {
          playHaptic('error');
          setNotice('saveFailed');
        },
      },
    );
  };

  const noticeText =
    notice === null
      ? null
      : notice === 'translations'
        ? tEvents('categoryTranslationRequired')
        : notice === 'slug'
          ? t('categorySlugInvalid')
          : notice === 'saveFailed'
            ? t('categorySaveFailed')
            : tErrors(getErrorMessageKey(notice));
  const canSave = name.trim().length > 0 && icon.trim().length > 0 && !save.isPending;

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
        {category === null ? tEvents('newCategory') : tEvents('editCategory')}
      </Text>
      <MultilingualField
        testIDPrefix="forum-category-name"
        label={tEvents('categoryName')}
        value={name}
        onChangeText={(value) => {
          touch();
          setName(value);
          nameReview.reset();
          if (!isSlugEdited) setSlug(forumCategorySlug(value));
        }}
        maxLength={NAME_MAX}
        {...reviewHandlers(nameReview, touch)}
      />
      <RaisedActionButton
        testID="forum-category-generate"
        label={isGenerating ? tEvents('generatingTranslations') : tEvents('categoryGenerate')}
        onPress={() => void generate()}
        isDisabled={name.trim().length === 0 || isGenerating}
      />
      <View className="gap-xs">
        <AuthTextField
          testID="forum-category-slug"
          label={t('categorySlug')}
          value={slug}
          onChangeText={(value) => {
            touch();
            setIsSlugEdited(true);
            setSlug(value);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={FIELD_MAX}
        />
        <Text className={`text-start text-sm text-neutral-600 ${fontClass}`}>
          {t('categorySlugHelp')}
        </Text>
      </View>
      <AuthTextField
        testID="forum-category-icon"
        label={t('categoryIcon')}
        value={icon}
        onChangeText={(value) => {
          touch();
          setIcon(value);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={FIELD_MAX}
      />
      <SectionColorPicker
        label={t('categoryColor')}
        choices={SECTION_COLOR_CHOICES}
        value={color}
        onChange={(value) => {
          touch();
          setColor(value);
        }}
        testIDPrefix="forum-category-color"
        noColorValue={NO_COLOR}
      />
      {noticeText === null || notice === null ? null : (
        <FailureNotice
          code={
            notice === 'translations'
              ? 'TRANSLATION-4'
              : notice === 'slug'
                ? 'VALIDATION-1'
                : notice === 'saveFailed'
                  ? 'DB-1'
                  : notice
          }
          message={noticeText}
        />
      )}
      <View className="flex-row flex-wrap gap-sm">
        <AuthSubmitButton
          testID="forum-category-save"
          label={t('categorySave')}
          onPress={submit}
          isLoading={save.isPending}
          disabled={!canSave}
        />
        <RaisedActionButton
          testID="forum-category-cancel"
          label={tEvents('categoryCancel')}
          onPress={onClose}
        />
      </View>
    </ScrollView>
  );
}

export function ForumCategorySheet({
  visible,
  category,
  nextSortOrder,
  onClose,
}: {
  readonly visible: boolean;
  /** The category to change, or null for a new one. */
  readonly category: ForumCategoryRow | null;
  /** Where a new category goes: after the last one. */
  readonly nextSortOrder: number;
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
      <SafeAreaView className="flex-1 bg-white" testID="forum-category-sheet">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        >
          {visible ? (
            <CategoryForm
              key={category?.id ?? 'new'}
              category={category}
              nextSortOrder={nextSortOrder}
              onClose={onClose}
            />
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
