import { Page } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import { CATEGORY_COLORS } from '@ramassa/shared/category-colors';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  countServicesIncompatibleWithCategorySchema,
  createServiceCategory,
  deleteServiceCategory,
  moveServiceCategory,
  reorderServiceCategories,
  serviceCategoryInputSchema,
  serviceMetadataSchemaDefinitionSchema,
  updateServiceCategory,
  type AdminServiceCategory,
} from '@ramassa/shared/services';
import { isTranslationReviewPublishable } from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';
import { reviewOptions } from './announcement-editor';
import { CategoryBasicsFields, CategoryListItem } from './category-manager-parts';

const EMPTY_SCHEMA = JSON.stringify({ fields: [] }, null, 2);

export function ServiceCategoryManager({
  initialCategories,
}: {
  readonly initialCategories: readonly AdminServiceCategory[];
}) {
  const { t, i18n } = useTranslation(['services', 'errors']);
  const [categories, setCategories] = useState([...initialCategories]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('circle');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0] ?? 'sky');
  const [schemaText, setSchemaText] = useState(EMPTY_SCHEMA);
  const [incompatibleCount, setIncompatibleCount] = useState(0);
  const [schemaInvalid, setSchemaInvalid] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const nameReview = useTranslationReview();
  const locale = (i18n.resolvedLanguage ?? 'ca') as keyof AdminServiceCategory['name'];

  function resetForm() {
    setEditingId(null);
    setName('');
    setSlug('');
    setIcon('circle');
    setColor(CATEGORY_COLORS[0] ?? 'sky');
    setSchemaText(EMPTY_SCHEMA);
    setIncompatibleCount(0);
    setSchemaInvalid(false);
    setReviewRequired(false);
    nameReview.reset();
  }

  function editCategory(category: AdminServiceCategory) {
    setEditingId(category.id);
    setName(category.name.ca);
    setSlug(category.slug);
    setIcon(category.icon);
    setColor(category.color);
    setSchemaText(JSON.stringify(category.metadataSchema, null, 2));
    setIncompatibleCount(0);
    setSchemaInvalid(false);
    setReviewRequired(false);
    const options = reviewOptions(category.name.ca, category.name);
    if (options !== undefined) nameReview.start(options);
  }

  function parseSchema() {
    try {
      return serviceMetadataSchemaDefinitionSchema.safeParse(JSON.parse(schemaText));
    } catch {
      return serviceMetadataSchemaDefinitionSchema.safeParse(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setSchemaInvalid(false);
    setReviewRequired(false);
    setIncompatibleCount(0);
    if (nameReview.review === undefined || !isTranslationReviewPublishable(nameReview.review)) {
      setReviewRequired(true);
      return;
    }
    const parsedSchema = parseSchema();
    if (!parsedSchema.success) {
      setSchemaInvalid(true);
      return;
    }
    const input = serviceCategoryInputSchema.safeParse({
      name: localizedTextFromReview(name, nameReview.review),
      slug,
      icon,
      color,
      metadataSchema: parsedSchema.data,
    });
    if (!input.success) {
      setSchemaInvalid(true);
      return;
    }
    setIsSaving(true);
    const result = await safeAsync(
      async () => {
        if (editingId !== null) {
          const count = await countServicesIncompatibleWithCategorySchema(
            supabase,
            editingId,
            parsedSchema.data,
          );
          if (count > 0) return { incompatible: count } as const;
        }
        const category =
          editingId === null
            ? await createServiceCategory(supabase, input.data)
            : await updateServiceCategory(supabase, editingId, input.data);
        return { category } as const;
      },
      {
        code: 'DB-1',
        context: {
          operation: editingId === null ? 'create-service-category' : 'update-service-category',
        },
      },
    );
    setIsSaving(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    if ('incompatible' in result.value && result.value.incompatible !== undefined) {
      setIncompatibleCount(result.value.incompatible);
      return;
    }
    if (!('category' in result.value) || result.value.category === undefined) return;
    const savedCategory = result.value.category;
    setCategories((previous) =>
      editingId === null
        ? [...previous, savedCategory]
        : previous.map((item) => (item.id === editingId ? savedCategory : item)),
    );
    resetForm();
  }

  async function persistOrder(next: readonly AdminServiceCategory[]) {
    const previous = categories;
    setCategories([...next]);
    const result = await safeAsync(
      () =>
        reorderServiceCategories(
          supabase,
          next.map((item) => item.id),
        ),
      { code: 'DB-1', context: { operation: 'reorder-service-categories' } },
    );
    if (!result.ok) {
      setCategories(previous);
      setErrorCode(result.error.code);
    }
  }

  function moveBy(categoryId: string, offset: -1 | 1) {
    const index = categories.findIndex((item) => item.id === categoryId);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= categories.length) return;
    const ids = moveServiceCategory(
      categories.map((item) => item.id),
      categoryId,
      categories[destination]!.id,
    );
    const byId = new Map(categories.map((item) => [item.id, item]));
    void persistOrder(
      ids.flatMap((id) => {
        const item = byId.get(id);
        return item === undefined ? [] : [item];
      }),
    );
  }

  async function remove(categoryId: string) {
    if (!window.confirm(t('services:categoryDeleteConfirm'))) return;
    const result = await safeAsync(() => deleteServiceCategory(supabase, categoryId), {
      code: 'DB-1',
      context: { operation: 'delete-service-category' },
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
          <h1 className="text-2xl font-semibold">{t('services:categoriesTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('services:categoriesHelp')}</p>
        </header>
        <ul className="flex flex-col gap-2" data-testid="service-category-list">
          {categories.map((category, index) => (
            <CategoryListItem
              key={category.id}
              testId={`service-category-row-${category.id}`}
              name={category.name[locale] ?? category.name.ca}
              slug={category.slug}
              color={category.color}
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={index === 0}
                data-testid={`service-category-up-${category.id}`}
                onClick={() => moveBy(category.id, -1)}
              >
                {t('services:categoryMoveUp')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={index === categories.length - 1}
                data-testid={`service-category-down-${category.id}`}
                onClick={() => moveBy(category.id, 1)}
              >
                {t('services:categoryMoveDown')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid={`service-category-edit-${category.id}`}
                onClick={() => editCategory(category)}
              >
                {t('services:categoryEdit')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => void remove(category.id)}
              >
                {t('services:categoryDelete')}
              </Button>
            </CategoryListItem>
          ))}
        </ul>
      </div>
      <form
        className="flex flex-col gap-4 rounded-lg border p-4"
        data-testid="service-category-editor"
        onSubmit={submit}
      >
        <h2 className="text-xl font-semibold">
          {editingId === null ? t('services:newCategory') : t('services:editCategory')}
        </h2>
        <CategoryBasicsFields
          idPrefix="service-category"
          namespace="services"
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
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('services:categorySchema')}</span>
          <Textarea
            required
            rows={16}
            data-testid="service-category-schema"
            className="font-mono text-xs"
            value={schemaText}
            onChange={(event) => {
              setSchemaText(event.target.value);
              setIncompatibleCount(0);
            }}
          />
        </label>
        {schemaInvalid ? (
          <p role="alert" className="text-sm text-destructive">
            {t('services:categorySchemaInvalid')}
          </p>
        ) : null}
        {reviewRequired ? (
          <p role="alert" className="text-sm text-destructive">
            {t('errors:TRANSLATION-4')}
          </p>
        ) : null}
        {incompatibleCount > 0 ? (
          <p
            role="alert"
            data-testid="service-category-schema-warning"
            className="text-sm text-destructive"
          >
            {t('services:categorySchemaWarning', { count: incompatibleCount })}
          </p>
        ) : null}
        {errorCode === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors:${errorCode}`)}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving} data-testid="service-category-save">
            {t('services:categorySave')}
          </Button>
          {editingId === null ? null : (
            <Button type="button" variant="outline" onClick={resetForm}>
              {t('services:categoryCancel')}
            </Button>
          )}
        </div>
      </form>
    </Page>
  );
}
