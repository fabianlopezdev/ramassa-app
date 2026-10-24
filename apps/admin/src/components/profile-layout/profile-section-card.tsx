/**
 * One section of the Fitxa (RAPP-650): a card with its grip, its name (click
 * to rename, in the five languages), how many fields it holds and "Add a
 * field", then its fields as rows. The rows are one sortable list that also
 * takes fields dragged in from another section; an empty section keeps one
 * row of room to drop into.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { ProfileFieldRow } from '@/components/profile-layout/profile-field-row';
import { SectionTitleForm } from '@/components/profile-layout/section-title-form';
import {
  DragHandle,
  SortableItem,
  type SortableHandle,
} from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
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

/** The id of a section's list as a drop target, apart from the section card itself. */
function sectionBodyId(sectionId: string): string {
  return `body:${sectionId}`;
}

export function ProfileSectionCard({
  section,
  fields,
  surfacesOf,
  handle,
  canEdit,
  onRename,
  onAddField,
  onEditField,
}: {
  readonly section: ProfileSection;
  /** Its fields in their order (as dragged, before the database answers). */
  readonly fields: readonly ProfileField[];
  readonly surfacesOf: (fieldId: string) => readonly ProfileSurface[];
  /** The card's grip; null for a reader. */
  readonly handle: SortableHandle | null;
  readonly canEdit: boolean;
  readonly onRename: (title: BuilderText) => Promise<void>;
  readonly onAddField: () => void;
  readonly onEditField: (field: ProfileField) => void;
}) {
  const { t, i18n } = useTranslation('settings');
  const name = textIn(section.title, (i18n.resolvedLanguage ?? 'ca') as LanguageCode);
  const [isRenaming, setIsRenaming] = useState(false);
  const { setNodeRef } = useDroppable({
    id: sectionBodyId(section.id),
    data: { type: 'section-body', sectionId: section.id },
    disabled: !canEdit,
  });
  const ids = fields.map((field) => field.id);

  const grip =
    handle === null ? (
      <span aria-hidden className="size-7 shrink-0" />
    ) : (
      <DragHandle handle={handle} label={t('profileLayout.moveSection', { section: name })} />
    );

  return (
    <EditorSection
      isFlush
      testId={`profile-section-${section.key}`}
      leading={isRenaming ? undefined : grip}
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
        isRenaming ? undefined : (
          <>
            <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
              {t('profileLayout.fieldCount', { count: fields.length })}
            </span>
            {canEdit ? (
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
            ) : null}
          </>
        )
      }
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className="flex flex-col divide-y" aria-label={name}>
          {fields.map((field) => (
            <SortableItem
              key={field.id}
              id={field.id}
              data={{ type: 'field', sectionId: section.id }}
              disabled={!canEdit}
              className="bg-card"
              draggingClassName="opacity-40"
            >
              {(fieldHandle) => (
                <ProfileFieldRow
                  field={field}
                  surfaces={surfacesOf(field.id)}
                  handle={canEdit ? fieldHandle : null}
                  canEdit={canEdit}
                  onEdit={() => onEditField(field)}
                />
              )}
            </SortableItem>
          ))}
          {fields.length === 0 ? (
            <li className="flex h-16 items-center px-5 text-start text-sm text-muted-foreground">
              {t('profileLayout.emptySection')}
            </li>
          ) : null}
        </ol>
      </SortableContext>
    </EditorSection>
  );
}
