/**
 * How one surface words what it asks (RAPP-651): an optional text per
 * language for this placement over the item's own. An empty box keeps the
 * item's own text in that language, shown as the box's placeholder.
 *
 *   - A field (`PlacementWordingForm`): its label and help. The onboarding
 *     editor calls the label "Com li ho preguntem"; the entity form (RAPP-652)
 *     gives its own legend.
 *   - A consent on a form (RAPP-771): the text she ticks on this form
 *     (`WordingOverrideForm` with one text).
 *
 * It writes in the language of the surrounding `EditingLanguageContext` and
 * reports each change as typed, for a phone drawn beside it.
 */

import { useChangedForm } from '@/components/fields/changed-form';
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
import type { LanguageCode } from '@ramassa/shared/schemas';

/** One text a placement can reword. */
export interface WordingOverrideText<Name extends string> {
  /** Its name in the form, and its key in what the form saves. */
  readonly name: Name;
  readonly legend: string;
  /** The placement's own wording; null keeps the item's. */
  readonly value: BuilderText | null;
  /** The item's own text, shown in an empty box. */
  readonly placeholder: (language: LanguageCode) => string;
  readonly isLong?: boolean;
}

function wordingFrom<Name extends string>(
  form: HTMLFormElement,
  texts: readonly WordingOverrideText<Name>[],
): Readonly<Record<Name, BuilderText>> {
  const fields = new FormData(form);
  return Object.fromEntries(
    texts.map((text) => [text.name, textFromForm(fields, text.name)]),
  ) as Record<Name, BuilderText>;
}

/** A placement's own wording of one or more texts, saved by its own button. */
export function WordingOverrideForm<Name extends string>({
  texts,
  onChange,
  onSave,
  onCancel,
  secondaryAction,
  testId,
}: {
  readonly texts: readonly WordingOverrideText<Name>[];
  readonly onChange?: (draft: Readonly<Record<Name, BuilderText>>) => void;
  readonly onSave: (draft: Readonly<Record<Name, BuilderText>>) => Promise<void>;
  readonly onCancel: () => void;
  /** A button at the start of the button row. */
  readonly secondaryAction?: ReactNode;
  readonly testId: string;
}) {
  const { t } = useTranslation('settings');
  const action = useAction();
  const changed = useChangedForm();
  return (
    <form
      ref={changed.formRef}
      className="flex max-w-xl flex-col gap-3"
      data-testid={testId}
      onInput={(event) => {
        changed.track(event.currentTarget);
        onChange?.(wordingFrom(event.currentTarget, texts));
      }}
      onSubmit={(event) => {
        event.preventDefault();
        const draft = wordingFrom(event.currentTarget, texts);
        void action
          .run(() => onSave(draft))
          .then((saved) => {
            if (saved) onCancel();
          });
      }}
    >
      {texts.map((text) => (
        <LanguageFields
          key={text.name}
          name={text.name}
          legend={text.legend}
          value={text.value}
          isCatalanRequired={false}
          isLong={text.isLong === true}
          placeholder={text.placeholder}
        />
      ))}
      <ErrorLine message={action.error} />
      <div className="flex flex-wrap items-center gap-2">
        {secondaryAction === undefined ? null : <div className="me-auto">{secondaryAction}</div>}
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('questions.cancel')}
        </Button>
        <Button
          type="submit"
          disabled={action.isBusy || !changed.isChanged}
          data-testid={`${testId}-save`}
        >
          {t('placement.saveWording')}
        </Button>
      </div>
    </form>
  );
}

export interface PlacementWordingDraft {
  readonly label: BuilderText;
  readonly help: BuilderText;
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
  const asDraft = (texts: Readonly<Record<'placement-label' | 'placement-help', BuilderText>>) => ({
    label: texts['placement-label'],
    help: texts['placement-help'],
  });
  return (
    <WordingOverrideForm
      texts={[
        {
          name: 'placement-label',
          legend,
          value: placement.labelOverride,
          placeholder: (language) => textIn(field.label, language),
        },
        {
          name: 'placement-help',
          legend: t('questions.help'),
          value: placement.helpOverride,
          isLong: true,
          placeholder: (language) => textIn(field.help, language),
        },
      ]}
      {...(onChange === undefined ? {} : { onChange: (texts) => onChange(asDraft(texts)) })}
      onSave={(texts) => onSave(asDraft(texts))}
      onCancel={onCancel}
      secondaryAction={secondaryAction}
      testId={testId}
    />
  );
}
