/**
 * One section of Dades de les jugadores (RAPP-650): a card with its name
 * (click to rename, in the five languages) and "Add a field", then column
 * labels over its fields as rows (RAPP-668). Sections are labels that help an
 * admin read the list; nothing in them is dragged (RAPP-658). Drawn with the
 * catalogue section Dades legals shares (RAPP-699).
 */

import { CatalogSection } from '@/components/profile-layout/catalog-section';
import { ProfileFieldRow } from '@/components/profile-layout/profile-field-row';
import { SectionTitleForm } from '@/components/profile-layout/section-title-form';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  textIn,
  type BuilderText,
  type ProfileField,
  type ProfileSection,
  type ProfileSurface,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function ProfileSectionCard({
  section,
  fields,
  surfacesOf,
  canEdit,
  onRename,
  onAddField,
  onEditField,
}: {
  readonly section: ProfileSection;
  /** The fields to show, in their order (all of them, or a search's matches). */
  readonly fields: readonly ProfileField[];
  readonly surfacesOf: (fieldId: string) => readonly ProfileSurface[];
  readonly canEdit: boolean;
  readonly onRename: (title: BuilderText) => Promise<void>;
  readonly onAddField: () => void;
  readonly onEditField: (field: ProfileField) => void;
}) {
  const { t, i18n } = useTranslation('settings');
  const name = textIn(section.title, (i18n.resolvedLanguage ?? 'ca') as LanguageCode);
  const [isRenaming, setIsRenaming] = useState(false);

  return (
    <CatalogSection
      testId={`profile-section-${section.key}`}
      label={name}
      title={
        isRenaming ? (
          <SectionTitleForm
            title={section.title}
            onSave={onRename}
            onCancel={() => setIsRenaming(false)}
            testId="section-rename"
          />
        ) : (
          <h2 className="min-w-0 truncate text-start text-base font-semibold">
            {canEdit ? (
              <button
                type="button"
                className="max-w-full truncate rounded-sm text-start outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => setIsRenaming(true)}
                aria-label={t('profileLayout.renameSection', { section: name })}
                data-testid={`profile-section-rename-${section.key}`}
              >
                {name}
              </button>
            ) : (
              name
            )}
          </h2>
        )
      }
      actions={
        isRenaming || !canEdit ? undefined : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddField}
            data-testid={`profile-section-add-${section.key}`}
          >
            <Plus aria-hidden data-icon="inline-start" />
            {t('profileLayout.addField')}
          </Button>
        )
      }
      columnName={t('profileLayout.columnField')}
      columnBadge={t('profileLayout.columnPrivacy')}
      emptyLabel={t('profileLayout.emptySection')}
      rows={fields.map((field) => ({
        id: field.id,
        row: (
          <ProfileFieldRow
            field={field}
            surfaces={surfacesOf(field.id)}
            canEdit={canEdit}
            onEdit={() => onEditField(field)}
          />
        ),
      }))}
    />
  );
}
