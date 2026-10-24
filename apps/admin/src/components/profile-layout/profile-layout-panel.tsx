/**
 * Organització › Dades de les jugadores (RAPP-650; its own page in the menu since
 * RAPP-654): the player profile layout, the pool every surface picks from
 * (RAPP-649). Sections in the team's reading order, each a card of field rows;
 * a count line above them.
 *
 * The people who design the layout (settings.organization, onboarding.design)
 * drag sections, drag fields within and across sections, rename a section in
 * place, add sections and fields, and edit or archive a Ramassà field in a
 * dialog. Anyone else who opens it reads it: no grips, no buttons. A drop
 * shows the new order at once and puts the old one back, with a toast, when
 * the database refuses it.
 */

import type { FieldFormDraft } from '@/components/fields/field-form';
import { Page, PageHeader } from '@/components/layout/page';
import { FieldDialog } from '@/components/profile-layout/field-dialog';
import { ProfileFieldRow } from '@/components/profile-layout/profile-field-row';
import { ProfileSectionCard } from '@/components/profile-layout/profile-section-card';
import { SectionTitleForm } from '@/components/profile-layout/section-title-form';
import {
  SortableItem,
  useSortableAccessibility,
  useSortableSensors,
} from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  fieldIdsBySection,
  fieldMove,
  profileLayoutCounts,
  profileLayoutOf,
  surfacesOfField,
  type ProfileLayoutCounts,
} from '@/lib/profile-layout';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fieldById,
  textIn,
  type IntakeCatalog,
  type ProfileField,
  type ProfileLayout,
  type ProfileSection,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

type FieldsBySection = Record<string, readonly string[]>;

const BODY_PREFIX = 'body:';

function dragType(data: { readonly current?: Record<string, unknown> | null } | undefined) {
  return data?.current?.['type'];
}

export function ProfileLayoutPanel({
  catalog,
  canEdit,
}: {
  readonly catalog: IntakeCatalog;
  readonly canEdit: boolean;
}) {
  const layout = profileLayoutOf(catalog);
  const signature = layout.sections
    .map((section) => `${section.id}:${(fieldIdsBySection(layout)[section.id] ?? []).join(',')}`)
    .join('|');
  // Keyed by the saved order: a reload after a change starts from the database.
  return <ProfileLayoutBoard key={signature} layout={layout} canEdit={canEdit} />;
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

function ProfileLayoutBoard({
  layout,
  canEdit,
}: {
  readonly layout: ProfileLayout;
  readonly canEdit: boolean;
}) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const actions = useProfileLayoutActions();
  const sensors = useSortableSensors();
  const [sectionOrder, setSectionOrder] = useState<readonly string[]>(() =>
    layout.sections.map((section) => section.id),
  );
  const [fieldsBy, setFieldsBy] = useState<FieldsBySection>(() => fieldIdsBySection(layout));
  const before = useRef<FieldsBySection>(fieldsBy);
  const [active, setActive] = useState<{ readonly type: string; readonly id: string } | null>(null);
  const [editing, setEditing] = useState<{
    readonly section: ProfileSection;
    readonly field: ProfileField | null;
  } | null>(null);
  const [isAddingSection, setIsAddingSection] = useState(false);

  const sections = new Map(layout.sections.map((section) => [section.id, section]));
  const sectionName = (id: string) => textIn(sections.get(id)?.title, language);
  const fieldName = (id: string) => textIn(fieldById(layout, id)?.label, language);
  const surfacesOf = (fieldId: string) => surfacesOfField(layout, fieldId);

  /** The section a field id, a section's list or a section card stands for. */
  function sectionOf(id: UniqueIdentifier, of: FieldsBySection = fieldsBy): string | undefined {
    const key = String(id);
    if (key.startsWith(BODY_PREFIX)) return key.slice(BODY_PREFIX.length);
    if (sections.has(key)) return key;
    return Object.keys(of).find((sectionId) => of[sectionId]?.includes(key));
  }

  const accessibility = useSortableAccessibility(
    (id) => (sections.has(String(id)) ? sectionName(String(id)) : fieldName(String(id))),
    (id) => {
      const key = String(id);
      if (sections.has(key) && active?.type === 'section') return sectionOrder.indexOf(key) + 1;
      const section = sectionOf(key);
      if (section === undefined) return 0;
      const list = fieldsBy[section] ?? [];
      return key.startsWith(BODY_PREFIX) ? list.length : list.indexOf(key) + 1;
    },
  );

  // A section only meets sections. A field meets the field under the pointer,
  // else the nearest field of the section it is over, else an empty section.
  const collisions: CollisionDetection = (args) => {
    const type = dragType(args.active.data);
    if (type === 'section') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => dragType(container.data) === 'section',
        ),
      });
    }
    const targets = args.droppableContainers.filter((container) => {
      const kind = dragType(container.data);
      return kind === 'field' || kind === 'section-body';
    });
    const pointer = pointerWithin({ ...args, droppableContainers: targets });
    const hits =
      pointer.length > 0 ? pointer : rectIntersection({ ...args, droppableContainers: targets });
    const hitFields = targets.filter(
      (container) =>
        dragType(container.data) === 'field' && hits.some((hit) => hit.id === container.id),
    );
    if (hitFields.length > 0) return closestCenter({ ...args, droppableContainers: hitFields });
    const body = hits.find((hit) => String(hit.id).startsWith(BODY_PREFIX));
    if (body === undefined) return [];
    const inside = fieldsBy[String(body.id).slice(BODY_PREFIX.length)] ?? [];
    if (inside.length === 0) return [body];
    return closestCenter({
      ...args,
      droppableContainers: targets.filter((container) => inside.includes(String(container.id))),
    });
  };

  function overField({ active: dragged, over }: DragOverEvent) {
    if (over === null || dragType(dragged.data) !== 'field') return;
    const from = sectionOf(dragged.id);
    const to = sectionOf(over.id);
    if (from === undefined || to === undefined || from === to) return;
    setFieldsBy((current) => {
      const target = [...(current[to] ?? [])];
      const index = target.indexOf(String(over.id));
      target.splice(index < 0 ? target.length : index, 0, String(dragged.id));
      return {
        ...current,
        [from]: (current[from] ?? []).filter((id) => id !== String(dragged.id)),
        [to]: target,
      };
    });
  }

  async function dropSection({ active: dragged, over }: DragEndEvent) {
    if (over === null || dragged.id === over.id) return;
    const previous = sectionOrder;
    const next = arrayMove(
      [...sectionOrder],
      sectionOrder.indexOf(String(dragged.id)),
      sectionOrder.indexOf(String(over.id)),
    );
    setSectionOrder(next);
    try {
      await actions.reorderSections(next);
    } catch {
      setSectionOrder(previous);
      toast.error(t('onboardingBoard.orderFailed'));
    }
  }

  async function dropField({ active: dragged, over }: DragEndEvent) {
    const id = String(dragged.id);
    let next = fieldsBy;
    const section = sectionOf(id);
    if (over !== null && section !== undefined && sectionOf(over.id) === section) {
      const list = [...(fieldsBy[section] ?? [])];
      const from = list.indexOf(id);
      const to = list.indexOf(String(over.id));
      if (to >= 0 && from !== to) next = { ...fieldsBy, [section]: arrayMove(list, from, to) };
    }
    setFieldsBy(next);
    const move = fieldMove(before.current, next, id);
    if (move === null) return;
    try {
      await actions.moveField(id, move.sectionId, move.order);
    } catch {
      setFieldsBy(before.current);
      toast.error(t('onboardingBoard.orderFailed'));
    }
  }

  const counts = profileLayoutCounts(layout);
  const liftedField = active?.type === 'field' ? fieldById(layout, active.id) : undefined;
  const liftedSection = active?.type === 'section' ? sections.get(active.id) : undefined;

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
      <CountLine counts={counts} />
      <DndContext
        sensors={sensors}
        collisionDetection={collisions}
        accessibility={accessibility}
        onDragStart={({ active: started }) => {
          before.current = fieldsBy;
          setActive({ type: String(dragType(started.data)), id: String(started.id) });
        }}
        onDragOver={overField}
        onDragCancel={() => {
          setActive(null);
          setFieldsBy(before.current);
        }}
        onDragEnd={(event) => {
          setActive(null);
          if (dragType(event.active.data) === 'section') void dropSection(event);
          else void dropField(event);
        }}
      >
        <SortableContext items={[...sectionOrder]} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-4" aria-label={t('profileLayout.title')}>
            {sectionOrder.map((sectionId) => {
              const section = sections.get(sectionId);
              if (section === undefined) return null;
              const fields = (fieldsBy[sectionId] ?? []).flatMap((id) => {
                const field = fieldById(layout, id);
                return field === undefined ? [] : [field];
              });
              return (
                <SortableItem
                  key={sectionId}
                  id={sectionId}
                  data={{ type: 'section' }}
                  disabled={!canEdit}
                  draggingClassName="opacity-40"
                >
                  {(handle) => (
                    <ProfileSectionCard
                      section={section}
                      fields={fields}
                      surfacesOf={surfacesOf}
                      handle={canEdit ? handle : null}
                      canEdit={canEdit}
                      onRename={(title) => actions.saveSection(section.id, title)}
                      onAddField={() => setEditing({ section, field: null })}
                      onEditField={(field) => setEditing({ section, field })}
                    />
                  )}
                </SortableItem>
              );
            })}
          </ol>
        </SortableContext>
        <DragOverlay>
          {liftedField === undefined ? null : (
            <ProfileFieldRow
              field={liftedField}
              surfaces={surfacesOf(liftedField.id)}
              handle={null}
              canEdit={canEdit}
              onEdit={() => undefined}
              isLifted
            />
          )}
          {liftedSection === undefined ? null : (
            <div className="flex h-14 items-center gap-3 rounded-xl border bg-card px-5 shadow-xl ring-2 ring-primary">
              <span className="min-w-0 flex-1 truncate text-start text-base font-semibold">
                {sectionName(liftedSection.id)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('profileLayout.fieldCount', {
                  count: (fieldsBy[liftedSection.id] ?? []).length,
                })}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

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
