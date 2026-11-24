/**
 * The fields of one screen of the referral form (RAPP-652, RAPP-938), in the
 * shared screen editor: the Fitxa fields placed on it, with the same picker
 * and rows as an onboarding screen. Staff add fields, drag them in order,
 * make each one required on this form or not, and word it for the entity
 * ("Com ho veu l'entitat"). "Add a signature" adds a signature block
 * (RAPP-690) the entity person signs: it moves among the fields and is always
 * required. A field asked on another screen of the form moves here when it
 * is added.
 *
 * Type and privacy belong to the field, so this list never asks them. Her
 * answers land on her fields with the entity as their source.
 */

import { FieldPicker, type FieldPickState } from '@/components/fields/field-picker';
import { AddBlockMenu, FormBlockRow } from '@/components/fields/form-block-row';
import { EditorSection } from '@/components/layout/editor-section';
import type { TypedWording } from '@/components/onboarding/screen-content';
import { SortableList } from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { profileLayoutOf } from '@/lib/profile-layout';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { usePlacementOrder } from '@/lib/use-placement-order';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  entityFormBlocksOf,
  entityFormItems,
  entityFormPick,
  entityFormScreenOf,
  formBlockText,
  placementOn,
  textIn,
  type EntityFormItem,
  type IntakeCatalog,
  type ProfileField,
  type SignatureFormBlock,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { EntityPlacementRow } from './entity-placement-row';

/** One row of the list: a placed field, or a signature block (RAPP-690). */
type FormRow =
  | { readonly kind: 'field'; readonly id: string; readonly item: EntityFormItem }
  | { readonly kind: 'block'; readonly id: string; readonly block: SignatureFormBlock };

/** The fields and the blocks in the order they share, a field first on a tie. */
function formRows(
  items: readonly EntityFormItem[],
  blocks: readonly SignatureFormBlock[],
): FormRow[] {
  return [
    ...items.map((item) => ({
      row: { kind: 'field', id: item.placement.id, item } as FormRow,
      order: item.placement.sortOrder,
      rank: 0,
    })),
    ...blocks.map((block) => ({
      row: { kind: 'block', id: block.id, block } as FormRow,
      order: block.sortOrder,
      rank: 1,
    })),
  ]
    .sort((a, b) => a.order - b.order || a.rank - b.rank)
    .map((entry) => entry.row);
}

export function ReferralScreenFields({
  catalog,
  screenKey,
  language,
  editing,
  onEdit,
  onWordingChange,
}: {
  readonly catalog: IntakeCatalog;
  /** The screen of the referral form this list edits. */
  readonly screenKey: string;
  /** The language the editor writes in. */
  readonly language: LanguageCode;
  /** The row open: a placement's id or a block's. */
  readonly editing: string | null;
  readonly onEdit: (id: string | null) => void;
  /** What is typed in an open row, for the phone beside it. */
  readonly onWordingChange: (wording: TypedWording | null) => void;
}) {
  const { t, i18n } = useTranslation('settings');
  const uiLanguage = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const layout = profileLayoutOf(catalog);
  const actions = useProfileLayoutActions();
  const [isPicking, setIsPicking] = useState(false);
  const isHere = (id: string) => entityFormScreenOf(catalog, id) === screenKey;
  const items = entityFormItems(layout).filter((item) => isHere(item.placement.id));
  const blocks = entityFormBlocksOf(catalog).filter((block) => isHere(block.id));
  const { ordered, reorder } = usePlacementOrder(
    'entity_form',
    screenKey,
    formRows(items, blocks),
    (row) => row.id,
  );
  const screenIds = (catalog.entityForm?.screens ?? []).map((screen) => screen.id);
  // Sections and the picker are the team's words, in the staff member's language.
  const sectionName = (field: ProfileField) =>
    textIn(layout.sections.find((section) => section.id === field.sectionId)?.title, uiLanguage);

  const toggle = (id: string) => {
    onWordingChange(null);
    onEdit(editing === id ? null : id);
  };

  const stateOf = (field: ProfileField): FieldPickState => {
    switch (entityFormPick(layout, field)) {
      case 'here': {
        // On the form once: one on another of its screens moves here.
        const placement = placementOn(layout, field.id, 'entity_form');
        const screen = placement === undefined ? null : entityFormScreenOf(catalog, placement.id);
        if (screen === null || screen === screenKey) {
          return { kind: 'placed', note: t('referralForm.here') };
        }
        return {
          kind: 'moves',
          note: t('fieldPicker.movesFrom', { number: screenIds.indexOf(screen) + 1 }),
        };
      }
      case 'hers':
        return { kind: 'blocked', note: t('referralForm.hers') };
      case 'free':
        return { kind: 'free' };
    }
  };

  return (
    <EditorSection title={t('referralForm.fields')} testId="referral-form-fields" isFlush>
      <SortableList
        items={ordered}
        idOf={(row) => row.id}
        nameOf={(row) =>
          row.kind === 'field'
            ? textIn(row.item.field.label, language)
            : formBlockText(row.block, language).text
        }
        onReorder={(ids) => void reorder(ids)}
        className="flex flex-col divide-y"
        itemTestId={(row) =>
          row.kind === 'field'
            ? `entity-placement-item-${row.item.field.id}`
            : `entity-block-${row.block.id}`
        }
        testId="entity-placement-list"
      >
        {(row, handle) =>
          row.kind === 'block' ? (
            <FormBlockRow
              block={row.block}
              handle={handle}
              language={language}
              isEditing={editing === row.block.id}
              onToggleEdit={() => toggle(row.block.id)}
              onContentChange={(block) =>
                onWordingChange(
                  block === null ? null : { fieldId: row.block.id, label: {}, help: {}, block },
                )
              }
            />
          ) : (
            <EntityPlacementRow
              item={row.item}
              siblings={items}
              sectionName={sectionName(row.item.field)}
              handle={handle}
              language={language}
              isEditing={editing === row.item.placement.id}
              onToggleEdit={() => toggle(row.item.placement.id)}
              onWordingChange={(draft) =>
                onWordingChange(draft === null ? null : { fieldId: row.item.field.id, ...draft })
              }
            />
          )
        }
      </SortableList>
      <div className="flex flex-wrap gap-2 border-t px-5 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsPicking(true)}
          data-testid="referral-form-add"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t('profileLayout.addField')}
        </Button>
        <AddBlockMenu
          surface="entity_form"
          screenKey={screenKey}
          kinds={['signature']}
          onAdded={onEdit}
        />
      </div>
      <FieldPicker
        layout={layout}
        isOpen={isPicking}
        onOpenChange={setIsPicking}
        title={t('referralForm.pickerTitle')}
        initialSectionId={layout.sections[0]?.id ?? null}
        stateOf={stateOf}
        onConfirm={(ids) => actions.placeFields('entity_form', screenKey, ids)}
        onCreateField={(section, draft) => actions.saveField(null, section, draft)}
        testId="referral-form-picker"
      />
    </EditorSection>
  );
}
