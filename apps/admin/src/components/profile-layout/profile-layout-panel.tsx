/**
 * Organització › Dades de les jugadores (RAPP-650; its own page in the menu since
 * RAPP-654): the player profile layout, the pool every surface picks from
 * (RAPP-649). Only the people who decide which data Ramassà asks for open it
 * (RAPP-658).
 *
 * A search on top, a count line, then the sections as cards of field rows.
 * Sections are labels that help read the list: nothing is dragged. Inside a
 * section the app's own fields come first, then the ones staff created, A to
 * Z (`fieldsOfSection`). An admin renames a section in place, adds sections
 * and fields, and edits or archives a Ramassà field in a dialog.
 */

import type { FieldFormDraft } from '@/components/fields/field-form';
import { Page, PageHeader } from '@/components/layout/page';
import { FieldDialog } from '@/components/profile-layout/field-dialog';
import { ProfileSectionCard } from '@/components/profile-layout/profile-section-card';
import { SectionTitleForm } from '@/components/profile-layout/section-title-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { searchFields } from '@/lib/field-picker';
import {
  profileLayoutCounts,
  profileLayoutOf,
  surfacesOfField,
  type ProfileLayoutCounts,
} from '@/lib/profile-layout';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { Plus, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fieldsOfSection,
  type IntakeCatalog,
  type ProfileField,
  type ProfileSection,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function ProfileLayoutPanel({
  catalog,
  canEdit,
}: {
  readonly catalog: IntakeCatalog;
  readonly canEdit: boolean;
}) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const layout = profileLayoutOf(catalog);
  const actions = useProfileLayoutActions();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{
    readonly section: ProfileSection;
    readonly field: ProfileField | null;
  } | null>(null);
  const [isAddingSection, setIsAddingSection] = useState(false);

  const isSearching = query.trim() !== '';
  const matches = new Set(searchFields(layout, query).map((field) => field.id));
  const shown = layout.sections.flatMap((section) => {
    const fields = fieldsOfSection(layout, section.id, false, language).filter(
      (field) => !isSearching || matches.has(field.id),
    );
    return isSearching && fields.length === 0 ? [] : [{ section, fields }];
  });
  const surfacesOf = (fieldId: string) => surfacesOfField(layout, fieldId);

  return (
    <Page data-testid="profile-layout">
      <PageHeader
        title={t('profileLayout.title')}
        actions={
          canEdit ? (
            <Button
              type="button"
              onClick={() => setIsAddingSection(true)}
              data-testid="profile-layout-add-section"
            >
              <Plus aria-hidden data-icon="inline-start" />
              {t('profileLayout.addSection')}
            </Button>
          ) : undefined
        }
      />
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          {t('fieldPicker.search')}
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={searchId}
          type="search"
          value={query}
          placeholder={t('fieldPicker.searchPlaceholder')}
          className="h-11 ps-9"
          onChange={(event) => setQuery(event.target.value)}
          data-testid="profile-layout-search"
        />
      </div>
      <CountLine counts={profileLayoutCounts(layout)} />
      {shown.length === 0 ? (
        <p
          className="text-start text-sm text-muted-foreground"
          data-testid="profile-layout-no-results"
        >
          {t('fieldPicker.noResults')}
        </p>
      ) : (
        <ol className="flex flex-col gap-4" aria-label={t('profileLayout.title')}>
          {shown.map(({ section, fields }) => (
            <li key={section.id}>
              <ProfileSectionCard
                section={section}
                fields={fields}
                surfacesOf={surfacesOf}
                canEdit={canEdit}
                onRename={(title) => actions.saveSection(section.id, title)}
                onAddField={() => setEditing({ section, field: null })}
                onEditField={(field) => setEditing({ section, field })}
              />
            </li>
          ))}
        </ol>
      )}

      {editing === null ? null : (
        <FieldDialog
          section={editing.section}
          field={editing.field}
          isOpen
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSave={(draft: FieldFormDraft) =>
            actions.saveField(editing.field, editing.section, draft)
          }
          onArchive={() =>
            editing.field === null ? Promise.resolve() : actions.archiveField(editing.field.id)
          }
          answerCount={() =>
            editing.field === null ? Promise.resolve(0) : actions.answerCount(editing.field.id)
          }
        />
      )}

      <Dialog open={isAddingSection} onOpenChange={setIsAddingSection}>
        <DialogContent className="max-w-md">
          <DialogTitle>{t('profileLayout.newSection')}</DialogTitle>
          <DialogDescription className="sr-only">{t('profileLayout.newSection')}</DialogDescription>
          <SectionTitleForm
            title={null}
            onSave={(title) => actions.saveSection(null, title)}
            onCancel={() => setIsAddingSection(false)}
            testId="section-new"
          />
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function CountLine({ counts }: { readonly counts: ProfileLayoutCounts }) {
  const { t } = useTranslation('settings');
  const items = [
    { key: 'sections', text: t('profileLayout.counts.sections', { count: counts.sections }) },
    { key: 'fields', text: t('profileLayout.counts.fields', { count: counts.fields }) },
    { key: 'sensitive', text: t('profileLayout.counts.sensitive', { count: counts.sensitive }) },
    { key: 'teamOnly', text: t('profileLayout.counts.teamOnly', { count: counts.teamOnly }) },
  ];
  return (
    <ul className="flex flex-wrap gap-3" data-testid="profile-layout-counts">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex h-10 items-center rounded-xl border bg-card px-4 text-sm text-muted-foreground"
        >
          {item.text}
        </li>
      ))}
    </ul>
  );
}
