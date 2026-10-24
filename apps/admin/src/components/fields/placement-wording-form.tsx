/**
 * How one surface asks a field (RAPP-651): an optional label and help per
 * language for this placement. An empty box keeps the field's own name in that
 * language, shown as the box's placeholder. The onboarding editor calls it
 * "Com li ho preguntem"; the entity form (RAPP-652) gives its own legend.
 *
 * It writes in the language of the surrounding `EditingLanguageContext` and
 * reports each change as typed, for a phone drawn beside it.
 */

import { ErrorLine, useAction } from '@/components/fields/field-form';
import { LanguageFields, textFromForm } from '@/components/fields/language-fields';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  textIn,
  type BuilderText,
  type FieldPlacement,
  type ProfileField,
} from '@ramassa/shared/intake-builder';

export interface PlacementWordingDraft {
  readonly label: BuilderText;
  readonly help: BuilderText;
}

function wordingFrom(form: HTMLFormElement): PlacementWordingDraft {
  const fields = new FormData(form);
  return {
    label: textFromForm(fields, 'placement-label'),
    help: textFromForm(fields, 'placement-help'),
  };
}

export function PlacementWordingForm({
  placement,
  field,
  legend,
  onChange,
  onSave,
  onCancel,
  secondaryAction,
  testId = 'placement-wording',
}: {
  readonly placement: FieldPlacement;
  readonly field: ProfileField;
  /** The label's legend on this surface. */
  readonly legend: string;
  readonly onChange?: (draft: PlacementWordingDraft) => void;
  readonly onSave: (draft: PlacementWordingDraft) => Promise<void>;
  readonly onCancel: () => void;
  /** A button at the start of the button row. */
  readonly secondaryAction?: ReactNode;
  readonly testId?: string;
}) {
  const { t } = useTranslation('settings');
  const action = useAction();
  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      data-testid={testId}
      onInput={(event) => onChange?.(wordingFrom(event.currentTarget))}
      onSubmit={(event) => {
        event.preventDefault();
        const draft = wordingFrom(event.currentTarget);
        void action
          .run(() => onSave(draft))
          .then((saved) => {
            if (saved) onCancel();
          });
      }}
    >
      <LanguageFields
        name="placement-label"
        legend={legend}
        value={placement.labelOverride}
        isCatalanRequired={false}
        placeholder={(language) => textIn(field.label, language)}
      />
      <LanguageFields
        name="placement-help"
        legend={t('questions.help')}
        value={placement.helpOverride}
        isCatalanRequired={false}
        isLong
        placeholder={(language) => textIn(field.help, language)}
      />
      <ErrorLine message={action.error} />
      <div className="flex flex-wrap items-center gap-2">
        {secondaryAction === undefined ? null : <div className="me-auto">{secondaryAction}</div>}
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('questions.cancel')}
        </Button>
        <Button type="submit" disabled={action.isBusy} data-testid={`${testId}-save`}>
          {t('placement.saveWording')}
        </Button>
      </div>
    </form>
  );
}
