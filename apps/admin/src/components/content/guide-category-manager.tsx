/**
 * The guide categories screen (RAPP-869), built like the service categories
 * one: the list, and a form to create or edit a category. A category a guide
 * still uses cannot be deleted: the database refuses it and the screen shows
 * the usual save error.
 */

import { Page } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import { CATEGORY_COLORS } from '@ramassa/shared/category-colors';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  createKnowledgeCategory,
  deleteKnowledgeCategory,
  knowledgeCategoryInputSchema,
  updateKnowledgeCategory,
  type KnowledgeCategoryRow,
} from '@ramassa/shared/knowledge';
import { isTranslationReviewPublishable } from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';
import { reviewOptions } from './announcement-editor';
import { CategoryBasicsFields, CategoryListItem } from './category-manager-parts';

const DEFAULT_ICON = 'circle';
const DEFAULT_COLOR = CATEGORY_COLORS[0] ?? 'sky';

export function GuideCategoryManager({
  initialCategories,
}: {
  readonly initialCategories: readonly KnowledgeCategoryRow[];
}) {
  const { t, i18n } = useTranslation(['knowledge', 'errors']);
  const [categories, setCategories] = useState([...initialCategories]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [inputInvalid, setInputInvalid] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const nameReview = useTranslationReview();
  const locale = (i18n.resolvedLanguage ?? 'ca') as keyof KnowledgeCategoryRow['name'];

  function resetForm() {
    setEditingId(null);
    setName('');
    setSlug('');
    setIcon(DEFAULT_ICON);
    setColor(DEFAULT_COLOR);
    setReviewRequired(false);
    setInputInvalid(false);
    nameReview.reset();
  }

  function editCategory(category: KnowledgeCategoryRow) {
    const source = category.name.ca ?? '';
    setEditingId(category.id);
    setName(source);
    setSlug(category.slug);
    setIcon(category.icon);
    setColor(category.color);
    setReviewRequired(false);
    setInputInvalid(false);
    const options = reviewOptions(source, { ...category.name, ca: source });
    if (options === undefined) nameReview.reset();
    else nameReview.start(options);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setReviewRequired(false);
    setInputInvalid(false);
    if (nameReview.review === undefined || !isTranslationReviewPublishable(nameReview.review)) {
      setReviewRequired(true);
      return;
    }
    const input = knowledgeCategoryInputSchema.safeParse({
      name: localizedTextFromReview(name, nameReview.review),
      slug,
      icon,
      color,
    });
    if (!input.success) {
      setInputInvalid(true);
      return;
    }
    setIsSaving(true);
    const result = await safeAsync(
      () =>
        editingId === null
          ? createKnowledgeCategory(supabase, input.data)
          : updateKnowledgeCategory(supabase, editingId, input.data),
      {
        code: 'DB-1',
        context: {
          operation: editingId === null ? 'create-knowledge-category' : 'update-knowledge-category',
        },
      },
    );
    setIsSaving(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    const saved = result.value;
    setCategories((previous) =>
      editingId === null
        ? [...previous, saved]
        : previous.map((item) => (item.id === editingId ? saved : item)),
    );
    resetForm();
  }

  async function remove(categoryId: string) {
    if (!window.confirm(t('knowledge:categoryDeleteConfirm'))) return;
    setErrorCode(null);
    const result = await safeAsync(() => deleteKnowledgeCategory(supabase, categoryId), {
      code: 'DB-1',
      context: { operation: 'delete-knowledge-category' },
    });
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    setCategories((previous) => previous.filter((item) => item.id !== categoryId));
    if (editingId === categoryId) resetForm();
  }

  return (
    <Page className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)]">
      <div className="flex flex-col gap-4">
        <header>
          <h1 className="text-2xl font-semibold">{t('knowledge:categoriesTitle')}</h1>
        </header>
        <ul className="flex flex-col gap-2" data-testid="guide-category-list">
          {categories.map((category) => (
            <CategoryListItem
              key={category.id}
              testId={`guide-category-row-${category.id}`}
              name={category.name[locale] ?? category.name.ca ?? category.slug}
              slug={category.slug}
              color={category.color}
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid={`guide-category-edit-${category.id}`}
                onClick={() => editCategory(category)}
              >
                {t('knowledge:categoryEdit')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                data-testid={`guide-category-delete-${category.id}`}
                onClick={() => void remove(category.id)}
              >
                {t('knowledge:categoryDelete')}
              </Button>
            </CategoryListItem>
          ))}
        </ul>
      </div>
      <form
        className="flex flex-col gap-4 rounded-lg border p-4"
        data-testid="guide-category-editor"
        onSubmit={submit}
      >
        <h2 className="text-xl font-semibold">
          {editingId === null ? t('knowledge:newCategory') : t('knowledge:editCategory')}
        </h2>
        <CategoryBasicsFields
          idPrefix="guide-category"
          namespace="knowledge"
          name={name}
          onNameChange={setName}
          nameReview={nameReview}
          slug={slug}
          onSlugChange={setSlug}
          icon={icon}
          onIconChange={setIcon}
          color={color}
          onColorChange={setColor}
          onError={setErrorCode}
        />
        {reviewRequired ? (
          <p role="alert" className="text-sm text-destructive">
            {t('errors:TRANSLATION-4')}
          </p>
        ) : null}
        {inputInvalid ? (
          <p role="alert" className="text-sm text-destructive">
            {t('errors:VALIDATION-1')}
          </p>
        ) : null}
        {errorCode === null ? null : (
          <p role="alert" className="text-sm text-destructive" data-testid="guide-category-error">
            {t(`errors:${errorCode}`)}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving} data-testid="guide-category-save">
            {t('knowledge:categorySave')}
          </Button>
          {editingId === null ? null : (
            <Button type="button" variant="outline" onClick={resetForm}>
              {t('knowledge:categoryCancel')}
            </Button>
          )}
        </div>
      </form>
    </Page>
  );
}
