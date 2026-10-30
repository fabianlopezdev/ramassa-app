/**
 * A signature block in a form editor's list (RAPP-690): an onboarding screen's
 * Questions, or the entity form's fields. It moves among the fields by its
 * grip, its Required switch is always on, Edit opens its text in the five
 * languages (Catalan required) and × removes it. The signatures already given
 * keep their text.
 *
 * "Add a signature" sits next to "Add a field" and adds a block at the end.
 */

import { useChangedForm } from '@/components/fields/changed-form';
import { ErrorLine, useAction } from '@/components/fields/field-form';
import { LanguageFields, textFromForm } from '@/components/fields/language-fields';
import { PlacementRow } from '@/components/fields/placement-row';
import { ConfirmDialog } from '@/components/onboarding/confirm-dialog';
import type { SortableHandle } from '@/components/ui-patterns/sortable-list';
import { Button } from '@/components/ui/button';
import { useProfileLayoutActions } from '@/lib/profile-layout-actions';
import { PenLine } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  formBlockText,
  type BuilderText,
  type FormBlock,
  type FormBlockSurface,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function SignatureBlockRow({
  block,
  handle,
  language,
  isEditing,
  onToggleEdit,
  onTextChange,
}: {
  readonly block: FormBlock;
  readonly handle: SortableHandle | null;
  /** The language the editor writes in. */
  readonly language: LanguageCode;
  readonly isEditing: boolean;
  readonly onToggleEdit: () => void;
  /** The text as typed, for a preview drawn beside it; null when the row closes. */
  readonly onTextChange?: (body: BuilderText | null) => void;
}) {
  const { t } = useTranslation('settings');
  const actions = useProfileLayoutActions();
  const action = useAction();
  const [isConfirming, setIsConfirming] = useState(false);
  const changed = useChangedForm();
  const name = formBlockText(block, language).text;
  const close = () => {
    onTextChange?.(null);
    onToggleEdit();
  };

  return (
    <>
      <PlacementRow
        name={name}
        detail={t('questions.types.signature')}
        type="signature"
        privacy={null}
        handle={handle}
        required={{
          id: `block-required-${block.id}`,
          checked: true,
          lockReason: t('signatureBlock.alwaysRequired'),
          onChange: () => undefined,
        }}
        isBusy={action.isBusy}
        isEditing={isEditing}
        onToggleEdit={isEditing ? close : onToggleEdit}
        onRemove={() => setIsConfirming(true)}
        removeLabel={t('signatureBlock.removeNamed')}
        testId={`block-row-${block.id}`}
      >
        <form
          ref={changed.formRef}
          className="flex max-w-xl flex-col gap-3"
          data-testid={`block-row-${block.id}-form`}
          onInput={(event) => {
            changed.track(event.currentTarget);
            onTextChange?.(textFromForm(new FormData(event.currentTarget), 'block-text'));
          }}
          onSubmit={(event) => {
            event.preventDefault();
            const body = textFromForm(new FormData(event.currentTarget), 'block-text');
            if ((body.ca ?? '').trim() === '') {
              toast.error(t('questions.catalanNeeded'));
              return;
            }
            void action
              .run(async () => {
                await actions.saveBlock({
                  id: block.id,
                  surface: block.surface,
                  screenKey: block.screenKey,
                  body,
                });
              })
              .then((saved) => {
                if (saved) close();
              });
          }}
        >
          <LanguageFields
            name="block-text"
            legend={t('signatureBlock.text')}
            value={block.body}
            isCatalanRequired
            isLong
          />
          <ErrorLine message={action.error} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t('questions.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={action.isBusy || !changed.isChanged}
              data-testid={`block-row-${block.id}-save`}
            >
              {t('placement.saveWording')}
            </Button>
          </div>
        </form>
      </PlacementRow>
      <ConfirmDialog
        isOpen={isConfirming}
        onOpenChange={setIsConfirming}
        title={t('signatureBlock.removeTitle')}
        description={t('signatureBlock.removeBody')}
        action={t('placement.remove')}
        onConfirm={() => void action.run(() => actions.removeBlock(block.id))}
      />
    </>
  );
}

/**
 * "Add a signature": a block at the end of the screen or form, with a first
 * Catalan text the team words at once.
 */
export function AddSignatureButton({
  surface,
  screenKey,
  onAdded,
}: {
  readonly surface: FormBlockSurface;
  readonly screenKey: string | null;
  /** The new block's id, to open it for its text. */
  readonly onAdded?: (id: string) => void;
}) {
  const { t } = useTranslation('settings');
  const actions = useProfileLayoutActions();
  const [isBusy, setIsBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isBusy}
      onClick={() => {
        setIsBusy(true);
        actions
          .saveBlock({
            id: null,
            surface,
            screenKey,
            body: { ca: t('signatureBlock.defaultText', { lng: 'ca' }) },
          })
          .then((id) => onAdded?.(id))
          .catch(() => toast.error(t('questions.failed')))
          .finally(() => setIsBusy(false));
      }}
      data-testid={`${surface}-add-signature`}
    >
      <PenLine aria-hidden data-icon="inline-start" />
      {t('signatureBlock.add')}
    </Button>
  );
}
