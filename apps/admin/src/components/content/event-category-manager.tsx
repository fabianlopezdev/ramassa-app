import { Button } from '@/components/ui/button';
import { safeAsync } from '@/lib/observability';
import { supabase } from '@/lib/supabase';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useState, type DragEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedTextFromReview } from '@ramassa/shared/announcements';
import type { AppErrorCode } from '@ramassa/shared/errors';
import {
  createEventCategory,
  deleteEventCategory,
  EVENT_CATEGORY_COLORS,
  EVENT_CATEGORY_ICONS,
  eventCategoryInputSchema,
  moveCategory,
  reorderEventCategories,
  updateEventCategory,
  type EventCategoryColor,
  type EventCategoryIcon,
  type EventCategoryRow,
} from '@ramassa/shared/events';
import { isTranslationReviewPublishable } from '@ramassa/shared/translation';
import { useTranslationReview } from '@ramassa/shared/translation/react';
import { approveAll, reviewOptions, startGeneratedReview } from './announcement-editor';
import { EventCategoryBadge, EventCategoryGlyph } from './event-category-badge';
import { MultilingualEditor } from './multilingual-editor';
import { TranslationReviewPanel } from './translation-review-panel';

export function EventCategoryManager({
  initialCategories,
}: {
  readonly initialCategories: readonly EventCategoryRow[];
}) {
  const { t } = useTranslation(['events', 'errors']);
  const [categories, setCategories] = useState([...initialCategories]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<EventCategoryIcon>('dumbbell');
  const [color, setColor] = useState<EventCategoryColor>('primary');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<AppErrorCode | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const nameReview = useTranslationReview();

  function resetForm() {
    setEditingId(null);
    setName('');
    setIcon('dumbbell');
    setColor('primary');
    setReviewRequired(false);
    nameReview.reset();
  }

  function editCategory(category: EventCategoryRow) {
    setEditingId(category.id);
    setName(category.name.ca);
    setIcon(category.icon);
    setColor(category.color);
    setReviewRequired(false);
    const options = reviewOptions(category.name.ca, category.name);
    if (options !== undefined) nameReview.start(options);
  }

  async function generateTranslations() {
    setErrorCode(null);
    setIsGenerating(true);
    const result = await requestCatalanTranslation(name);
    if (result.ok) startGeneratedReview(result.value, nameReview.start);
    else setErrorCode(result.error.code);
    setIsGenerating(false);
  }

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setErrorCode(null);
    setReviewRequired(false);
    if (nameReview.review === undefined || !isTranslationReviewPublishable(nameReview.review)) {
      setReviewRequired(true);
      return;
    }
    const validation = eventCategoryInputSchema.safeParse({
      name: localizedTextFromReview(name, nameReview.review),
      icon,
      color,
    });
    if (!validation.success) {
      setReviewRequired(true);
      return;
    }
    const input = validation.data;

    setIsSaving(true);
    const result = await safeAsync(
      () =>
        editingId === null
          ? createEventCategory(supabase, input)
          : updateEventCategory(supabase, editingId, input),
      {
        code: 'DB-1',
        context: {
          operation: editingId === null ? 'create-event-category' : 'update-event-category',
        },
      },
    );
    setIsSaving(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    setCategories((previous) =>
      editingId === null
        ? [...previous, result.value]
        : previous.map((category) => (category.id === editingId ? result.value : category)),
    );
    resetForm();
  }

  async function persistOrder(next: readonly EventCategoryRow[]) {
    const previous = categories;
    setCategories([...next]);
    const result = await safeAsync(
      () =>
        reorderEventCategories(
          supabase,
          next.map((category) => category.id),
        ),
      { code: 'DB-1', context: { operation: 'reorder-event-categories' } },
    );
    if (!result.ok) {
      setCategories(previous);
      setErrorCode(result.error.code);
    }
  }

  function dropOn(targetId: string, dragEvent: DragEvent<HTMLLIElement>) {
    dragEvent.preventDefault();
    const sourceId = draggedId ?? dragEvent.dataTransfer.getData('text/plain');
    const orderedIds = moveCategory(
      categories.map((category) => category.id),
      sourceId,
      targetId,
    );
    const byId = new Map(categories.map((category) => [category.id, category]));
    const next = orderedIds.flatMap((id) => {
      const category = byId.get(id);
      return category === undefined ? [] : [category];
    });
    setDraggedId(null);
    void persistOrder(next);
  }

  function moveBy(categoryId: string, offset: -1 | 1) {
    const index = categories.findIndex((category) => category.id === categoryId);
    const destination = index + offset;
    if (index < 0 || destination < 0 || destination >= categories.length) return;
    const next = [...categories];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    void persistOrder(next);
  }

  async function removeCategory(categoryId: string) {
    if (!window.confirm(t('events:categoryDeleteConfirm'))) return;
    const result = await safeAsync(() => deleteEventCategory(supabase, categoryId), {
      code: 'DB-1',
      context: { operation: 'delete-event-category' },
    });
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    setCategories((previous) => previous.filter((category) => category.id !== categoryId));
    if (editingId === categoryId) resetForm();
  }

  return (
    <section className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('events:categoriesTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('events:categoriesHelp')}</p>
        </header>
        <ul className="flex flex-col gap-2" data-testid="event-category-list">
          {categories.map((category, index) => (
            <li
              key={category.id}
              draggable
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3"
              data-testid={`event-category-row-${category.id}`}
              onDragStart={(dragEvent) => {
                setDraggedId(category.id);
                dragEvent.dataTransfer.setData('text/plain', category.id);
              }}
              onDragOver={(dragEvent) => dragEvent.preventDefault()}
              onDrop={(dragEvent) => dropOn(category.id, dragEvent)}
            >
              <span className="min-w-0 flex-1">
                <EventCategoryBadge category={category} />
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={index === 0}
                data-testid={`event-category-up-${category.id}`}
                onClick={() => moveBy(category.id, -1)}
              >
                {t('events:categoryMoveUp')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={index === categories.length - 1}
                data-testid={`event-category-down-${category.id}`}
                onClick={() => moveBy(category.id, 1)}
              >
                {t('events:categoryMoveDown')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => editCategory(category)}
              >
                {t('events:categoryEdit')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => void removeCategory(category.id)}
              >
                {t('events:categoryDelete')}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <form
        className="flex flex-col gap-4 rounded-lg border p-4"
        onSubmit={submit}
        data-testid="event-category-editor"
      >
        <h2 className="text-xl font-semibold">
          {editingId === null ? t('events:newCategory') : t('events:editCategory')}
        </h2>
        <MultilingualEditor
          fieldId="event-category-name"
          sourceLabel={t('events:categoryName')}
          sourceValue={name}
          review={nameReview.review}
          maxLength={200}
          onSourceChange={(value) => {
            setName(value);
            nameReview.reset();
          }}
          onTranslationChange={nameReview.edit}
        />
        <TranslationReviewPanel
          fieldId="event-category-name"
          review={nameReview.review}
          onApprove={nameReview.approve}
          onReject={nameReview.reject}
          onApproveAll={() => approveAll(nameReview.review, nameReview.approve)}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={name.trim().length === 0 || isGenerating}
          data-testid="event-category-generate"
          onClick={() => void generateTranslations()}
        >
          {t('events:categoryGenerate')}
        </Button>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('events:categoryIcon')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={icon}
            data-testid="event-category-icon"
            onChange={(changeEvent) => setIcon(changeEvent.target.value as EventCategoryIcon)}
          >
            {EVENT_CATEGORY_ICONS.map((value) => (
              <option key={value} value={value}>
                {t(`events:icon${pascalCase(value)}`)}
              </option>
            ))}
          </select>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <EventCategoryGlyph icon={icon} label={t(`events:icon${pascalCase(icon)}`)} />
            {t(`events:icon${pascalCase(icon)}`)}
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('events:categoryColor')}</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={color}
            data-testid="event-category-color"
            onChange={(changeEvent) => setColor(changeEvent.target.value as EventCategoryColor)}
          >
            {EVENT_CATEGORY_COLORS.map((value) => (
              <option key={value} value={value}>
                {t(`events:color${pascalCase(value)}`)}
              </option>
            ))}
          </select>
        </label>
        {reviewRequired ? (
          <p role="alert" className="text-sm text-destructive">
            {t('events:categoryTranslationRequired')}
          </p>
        ) : null}
        {errorCode === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors:${errorCode}`)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSaving} data-testid="event-category-save">
            {t('events:categorySave')}
          </Button>
          {editingId === null ? null : (
            <Button type="button" variant="outline" onClick={resetForm}>
              {t('events:categoryCancel')}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function pascalCase(value: string): string {
  return value
    .split('-')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join('');
}
