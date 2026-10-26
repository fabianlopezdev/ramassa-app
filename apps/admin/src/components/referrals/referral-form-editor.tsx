/**
 * Formulari de derivació (RAPP-652): what an entity fills in when it refers
 * a woman, composed from the Fitxa with the same picker and rows as an
 * onboarding screen. Staff add fields, drag them in order, make each one
 * required on this form or not, and word it for the entity ("Com ho veu
 * l'entitat"). The form as the entity sees it stays in view on the end side.
 * "Add a signature" adds a signature block (RAPP-690) the entity person signs:
 * it moves among the fields and is always required.
 *
 * Type and privacy belong to the field, so this editor never asks them. Her
 * answers land on her fields with the entity as their source.
 */

import { FieldPicker, type FieldPickState } from '@/components/fields/field-picker';
import type { PlacementWordingDraft } from '@/components/fields/placement-wording-form';
import { AddSignatureButton, SignatureBlockRow } from '@/components/fields/signature-block-row';
import { EditorColumns } from '@/components/layout/editor-columns';
import { EditorSection } from '@/components/layout/editor-section';
import { SortableList } from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { profileLayoutOf } from '@/lib/profile-layout';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { usePlacementOrder } from '@/lib/use-placement-order';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  entityFormItems,
  entityFormPick,
  formBlocksOn,
  formBlockText,
  textIn,
  type BuilderText,
  type EntityFormItem,
  type FormBlock,
  type IntakeCatalog,
  type ProfileField,
  type ProfileLayout,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';
import { EntityPlacementRow } from './entity-placement-row';
import { ReferralFormPreview } from './referral-form-preview';

/** The layout with the wording staff are typing, for the preview. */
function withTypedWording(
  layout: ProfileLayout,
  typed: (PlacementWordingDraft & { readonly placementId: string }) | null,
): ProfileLayout {
  if (typed === null) return layout;
  return {
    ...layout,
    placements: layout.placements.map((placement) =>
      placement.id === typed.placementId
        ? { ...placement, labelOverride: typed.label, helpOverride: typed.help }
        : placement,
    ),
  };
}

/** One row of the list: a placed field, or a signature block (RAPP-690). */
type FormRow =
  | { readonly kind: 'field'; readonly id: string; readonly item: EntityFormItem }
  | { readonly kind: 'block'; readonly id: string; readonly block: FormBlock };

/** The fields and the blocks in the order they share, a field first on a tie. */
function formRows(items: readonly EntityFormItem[], blocks: readonly FormBlock[]): FormRow[] {
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

export function ReferralFormEditor({
  catalog,
  entityNames,
}: {
  readonly catalog: IntakeCatalog;
  /** The organization's partner entities, as the preview lists them. */
  readonly entityNames: readonly string[];
}) {
  const { t, i18n } = useTranslation('settings');
  const uiLanguage = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const layout = profileLayoutOf(catalog);
  const actions = useProfileLayoutActions();
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [previewLanguage, setPreviewLanguage] = useState<LanguageCode>('ca');
  const [editing, setEditing] = useState<string | null>(null);
  const [typed, setTyped] = useState<
    (PlacementWordingDraft & { readonly placementId: string }) | null
  >(null);
  const [isPicking, setIsPicking] = useState(false);
  const items = entityFormItems(layout);
  const blocks = formBlocksOn(catalog.blocks, 'entity_form', null);
  const [typedBlock, setTypedBlock] = useState<{
    readonly id: string;
    readonly body: BuilderText;
  } | null>(null);
  const { ordered, reorder } = usePlacementOrder(
    'entity_form',
    null,
    formRows(items, blocks),
    (row) => row.id,
  );
  // Sections and the picker are the team's words, in the staff member's language.
  const sectionName = (field: ProfileField) =>
    textIn(layout.sections.find((section) => section.id === field.sectionId)?.title, uiLanguage);

  const stateOf = (field: ProfileField): FieldPickState => {
    switch (entityFormPick(layout, field)) {
      case 'here':
        return { kind: 'placed', note: t('referralForm.here') };
      case 'hers':
        return { kind: 'blocked', note: t('referralForm.hers') };
      case 'free':
        return { kind: 'free' };
    }
  };

  const form = (
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
            <SignatureBlockRow
              block={row.block}
              handle={handle}
              language={language}
              isEditing={editing === row.block.id}
              onToggleEdit={() =>
                setEditing((open) => (open === row.block.id ? null : row.block.id))
              }
              onTextChange={(body) =>
                setTypedBlock(body === null ? null : { id: row.block.id, body })
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
              onToggleEdit={() =>
                setEditing((open) =>
                  open === row.item.placement.id ? null : row.item.placement.id,
                )
              }
              onWordingChange={(draft) =>
                setTyped(draft === null ? null : { placementId: row.item.placement.id, ...draft })
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
        <AddSignatureButton surface="entity_form" screenKey={null} onAdded={setEditing} />
      </div>
      <FieldPicker
        layout={layout}
        isOpen={isPicking}
        onOpenChange={setIsPicking}
        title={t('referralForm.pickerTitle')}
        initialSectionId={layout.sections[0]?.id ?? null}
        stateOf={stateOf}
        onConfirm={(ids) => actions.placeFields('entity_form', null, ids)}
        onCreateField={(section, draft) => actions.saveField(null, section, draft)}
        testId="referral-form-picker"
      />
    </EditorSection>
  );

  return (
    <EditorColumns
      language={language}
      onLanguageChange={setLanguage}
      previewLanguage={previewLanguage}
      onPreviewLanguageChange={setPreviewLanguage}
      previewLabel={t('referralForm.preview')}
      previewLanguageLabel={t('referralForm.previewLanguage')}
      previewLanguageTestId="referral-preview-language"
      form={form}
      preview={
        <ReferralFormPreview
          layout={withTypedWording(layout, typed)}
          language={previewLanguage}
          entityNames={entityNames}
          blocks={blocks.map((block) =>
            typedBlock?.id === block.id ? { ...block, body: typedBlock.body } : block,
          )}
        />
      }
    />
  );
}
