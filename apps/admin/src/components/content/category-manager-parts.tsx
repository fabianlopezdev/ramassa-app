/**
 * The pieces every category manager shares (RAPP-869): a row of the list and
 * the fields a category always has (its name in every language through the
 * translation review, its slug, icon and colour). The service and guide
 * managers both build on them, so the two screens look and behave the same.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestCatalanTranslation } from '@/lib/translation-worker';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppErrorCode } from '@ramassa/shared/errors';
import type { UseTranslationReviewResult } from '@ramassa/shared/translation/react';
import { approveAll, startGeneratedReview } from './announcement-editor';
import { CategoryColorSelect, CategoryColorSwatch } from './category-color-select';
import { MultilingualEditor } from './multilingual-editor';
import { TranslationReviewPanel } from './translation-review-panel';

/** The catalogs that hold a category manager's labels: `categoryName`, `categorySlug`, `categoryIcon`. */
export type CategoryNamespace = 'services' | 'knowledge';

export function CategoryListItem({
  testId,
  name,
  slug,
  color,
  children,
}: {
  readonly testId: string;
  readonly name: string;
  readonly slug: string;
  readonly color: string;
  /** The row's actions. */
  readonly children: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border p-3" data-testid={testId}>
      <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
        <CategoryColorSwatch color={color} />
        {name}
        <span className="text-xs text-muted-foreground">{slug}</span>
      </span>
      {children}
    </li>
  );
}

export function CategoryBasicsFields({
  idPrefix,
  namespace,
  name,
  onNameChange,
  nameReview,
  slug,
  onSlugChange,
  icon,
  onIconChange,
  color,
  onColorChange,
  onError,
}: {
  /** Prefix of the fields' ids and test ids, e.g. `service-category`. */
  readonly idPrefix: string;
  readonly namespace: CategoryNamespace;
  readonly name: string;
  readonly onNameChange: (value: string) => void;
  readonly nameReview: UseTranslationReviewResult;
  readonly slug: string;
  readonly onSlugChange: (value: string) => void;
  readonly icon: string;
  readonly onIconChange: (value: string) => void;
  readonly color: string;
  readonly onColorChange: (value: string) => void;
  /** `null` clears the form's error when a new translation starts. */
  readonly onError: (code: AppErrorCode | null) => void;
}) {
  const { t } = useTranslation(namespace);
  const [isGenerating, setIsGenerating] = useState(false);
  const nameFieldId = `${idPrefix}-name`;

  async function generateTranslations() {
    onError(null);
    setIsGenerating(true);
    const result = await requestCatalanTranslation(name);
    if (result.ok) startGeneratedReview(result.value, nameReview.start);
    else onError(result.error.code);
    setIsGenerating(false);
  }

  return (
    <>
      <MultilingualEditor
        fieldId={nameFieldId}
        sourceLabel={t('categoryName')}
        sourceValue={name}
        review={nameReview.review}
        maxLength={200}
        translationNamespace={namespace}
        onSourceChange={(value) => {
          onNameChange(value);
          nameReview.reset();
        }}
        onTranslationChange={nameReview.edit}
      />
      <TranslationReviewPanel
        fieldId={nameFieldId}
        review={nameReview.review}
        translationNamespace={namespace}
        onApprove={nameReview.approve}
        onReject={nameReview.reject}
        onApproveAll={() => approveAll(nameReview.review, nameReview.approve)}
      />
      <Button
        type="button"
        variant="secondary"
        data-testid={`${idPrefix}-generate`}
        disabled={name.trim().length === 0 || isGenerating}
        onClick={() => void generateTranslations()}
      >
        {isGenerating ? t('generatingTranslations') : t('generateTranslations')}
      </Button>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('categorySlug')}</span>
        <Input
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          data-testid={`${idPrefix}-slug`}
          value={slug}
          onChange={(event) => onSlugChange(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('categoryIcon')}</span>
        <Input
          required
          data-testid={`${idPrefix}-icon`}
          value={icon}
          onChange={(event) => onIconChange(event.target.value)}
        />
      </label>
      <CategoryColorSelect value={color} onChange={onColorChange} testId={`${idPrefix}-color`} />
    </>
  );
}
