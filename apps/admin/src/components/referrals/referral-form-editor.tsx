/**
 * Formulari de derivació (RAPP-652): what an entity fills in when it refers
 * a woman, composed from the Fitxa with the same picker and rows as an
 * onboarding screen. Staff add fields, drag them in order, make each one
 * required on this form or not, and word it for the entity ("Com ho veu
 * l'entitat"). The form as the entity sees it stays in view on the end side.
 *
 * Type and privacy belong to the field, so this editor never asks them. Her
 * answers land on her fields with the entity as their source.
 */

import { FieldPicker, type FieldPickState } from '@/components/fields/field-picker';
import type { PlacementWordingDraft } from '@/components/fields/placement-wording-form';
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
  textIn,
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
  const { ordered, reorder } = usePlacementOrder('entity_form', null, items);
  // Sections and the picker are the team's words, in the staff member's language.
  const sectionName = (field: ProfileField) =>
    textIn(layout.sections.find((section) => section.id === field.sectionId)?.title, uiLanguage);

  const stateOf = (field: ProfileField): FieldPickState => {
    switch (entityFormPick(layout, field)) {
      case 'here':
        return { kind: 'placed', note: t('referralForm.here') };
      case 'hers':
        return { kind: 'blocked', note: t('referralForm.hers') };
      case 'notOnForm':
        return { kind: 'blocked', note: t('referralForm.notOnForm') };
      case 'free':
        return { kind: 'free' };
    }
  };

  const form = (
    <EditorSection title={t('referralForm.fields')} testId="referral-form-fields" isFlush>
      <SortableList
        items={ordered}
        idOf={(item) => item.placement.id}
        nameOf={(item) => textIn(item.field.label, language)}
        onReorder={(ids) => void reorder(ids)}
        className="flex flex-col divide-y"
        itemTestId={(item) => `entity-placement-item-${item.field.id}`}
        testId="entity-placement-list"
      >
        {(item, handle) => (
          <EntityPlacementRow
            item={item}
            siblings={items}
            sectionName={sectionName(item.field)}
            handle={handle}
            language={language}
            isEditing={editing === item.placement.id}
            onToggleEdit={() =>
              setEditing((open) => (open === item.placement.id ? null : item.placement.id))
            }
            onWordingChange={(draft) =>
              setTyped(draft === null ? null : { placementId: item.placement.id, ...draft })
            }
          />
        )}
      </SortableList>
      <div className="border-t px-5 py-3">
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
        />
      }
    />
  );
}
