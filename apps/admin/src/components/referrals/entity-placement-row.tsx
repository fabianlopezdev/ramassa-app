/**
 * One field on the entity referral form (RAPP-652): the onboarding editor's
 * placement row, with "Com ho veu l'entitat" as its wording. Her names keep
 * their place on the form and stay required; any other field can be made
 * optional, reworded or taken off the form, and stays on the Fitxa.
 */

import { PlacementRow } from '@/components/fields/placement-row';
import {
  PlacementWordingForm,
  type PlacementWordingDraft,
} from '@/components/fields/placement-wording-form';
import { ConfirmDialog } from '@/components/onboarding/confirm-dialog';
import type { SortableHandle } from '@/components/ui-patterns/sortable-list';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isAlwaysOnEntityForm, textIn, type EntityFormItem } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function EntityPlacementRow({
  item,
  siblings,
  sectionName,
  handle,
  language,
  isEditing,
  onToggleEdit,
  onWordingChange,
}: {
  readonly item: EntityFormItem;
  /** The fields on the form, for the conditions that depend on this one. */
  readonly siblings: readonly EntityFormItem[];
  readonly sectionName: string;
  readonly handle: SortableHandle;
  /** The language the editor writes in. */
  readonly language: LanguageCode;
  readonly isEditing: boolean;
  readonly onToggleEdit: () => void;
  readonly onWordingChange: (draft: PlacementWordingDraft | null) => void;
}) {
  const { t } = useTranslation('settings');
  const actions = useProfileLayoutActions();
  const [isBusy, setIsBusy] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const { placement, field } = item;
  const name = textIn(field.label, language);
  const isLocked = isAlwaysOnEntityForm(field);

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch {
      toast.error(t('questions.failed'));
    } finally {
      setIsBusy(false);
    }
  }

  function askRemove() {
    // A condition stays with the field it depends on (the database says so too).
    const dependent = siblings.find((each) => each.field.showWhen?.fieldId === field.id);
    if (dependent !== undefined) {
      toast.error(
        t('placement.removeConditionFirst', { field: textIn(dependent.field.label, language) }),
      );
      return;
    }
    setIsConfirming(true);
  }

  const close = () => {
    onWordingChange(null);
    onToggleEdit();
  };

  return (
    <>
      <PlacementRow
        name={name}
        detail={sectionName}
        type={field.type}
        privacy={field.privacy}
        handle={handle}
        required={{
          id: `entity-required-${field.id}`,
          checked: placement.required,
          ...(isLocked ? { lockReason: t('questions.requiredLock.always') } : {}),
          onChange: (next) =>
            void run(() =>
              actions.savePlacement(placement.id, {
                required: next,
                labelOverride: placement.labelOverride,
                helpOverride: placement.helpOverride,
              }),
            ),
        }}
        isBusy={isBusy}
        isEditing={isEditing}
        onToggleEdit={isEditing ? close : onToggleEdit}
        {...(isLocked
          ? {}
          : {
              onRemove: askRemove,
              removeLabel: t('referralForm.removeNamed', { field: name }),
            })}
        testId={`entity-placement-${field.id}`}
      >
        <PlacementWordingForm
          key={placement.id}
          placement={placement}
          field={field}
          legend={t('referralForm.wording')}
          onChange={onWordingChange}
          onSave={(draft) =>
            actions.savePlacement(placement.id, {
              required: placement.required,
              labelOverride: draft.label,
              helpOverride: draft.help,
            })
          }
          onCancel={close}
          testId={`entity-wording-${field.id}`}
        />
      </PlacementRow>
      <ConfirmDialog
        isOpen={isConfirming}
        onOpenChange={setIsConfirming}
        title={t('referralForm.removeTitle', { field: name })}
        description={t('placement.removeBody')}
        action={t('placement.remove')}
        onConfirm={() => void run(() => actions.removePlacement(placement.id))}
      />
    </>
  );
}
