/**
 * The name and the choices of a form the team creates (RAPP-700, RAPP-701):
 * who fills it, when it must be answered (with its date), who it is for, and
 * whether it repeats every season. The new form dialog asks them, and the
 * form's Configuració tab edits them.
 *
 * Fabián asked for a line under each "Quan s'ha de respondre" option and
 * under "Es repeteix cada temporada?", so the choice is clear before the form
 * exists: the exception to the no-helper-text rule. A form an entity fills in
 * is shown and not available yet: the entity portal has one referral form.
 */

import { LanguageTabs } from '@/components/onboarding/language-tabs';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import {
  CUSTOM_FORM_AUDIENCES,
  CUSTOM_FORM_FILLERS,
  CUSTOM_FORM_MANDATORY_LEVELS,
  type CustomFormChoices,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** What the choices say is wrong before they are saved; null when they can be saved. */
export function choicesProblem(
  choices: CustomFormChoices,
): 'customForms.nameNeeded' | 'customForms.deadlineNeeded' | null {
  if ((choices.name.ca ?? '').trim() === '') return 'customForms.nameNeeded';
  if (choices.mandatory === 'required_from_date' && (choices.deadline ?? '') === '') {
    return 'customForms.deadlineNeeded';
  }
  return null;
}

/** One choice as a card: its title, and its line when it has one. */
function ChoiceCards<Value extends string>({
  legend,
  name,
  value,
  options,
  isDisabled = false,
  onChange,
  testId,
}: {
  readonly legend: string;
  readonly name: string;
  readonly value: Value;
  readonly options: readonly {
    readonly value: Value;
    readonly title: string;
    readonly line?: string;
    readonly isDisabled?: boolean;
  }[];
  readonly isDisabled?: boolean;
  readonly onChange: (value: Value) => void;
  readonly testId: string;
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <div
        role="radiogroup"
        aria-label={legend}
        className="flex flex-col gap-2"
        data-testid={testId}
      >
        {options.map((option) => {
          const isChosen = option.value === value;
          const isOff = isDisabled || option.isDisabled === true;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              name={name}
              aria-checked={isChosen}
              disabled={isOff}
              onClick={() => onChange(option.value)}
              data-testid={`${testId}-${option.value}`}
              className={cn(
                'flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
                isChosen ? 'border-primary bg-primary/5' : 'hover:bg-muted',
              )}
            >
              <span className="text-sm font-medium">{option.title}</span>
              {option.line === undefined ? null : (
                <span className="text-sm text-muted-foreground">{option.line}</span>
              )}
            </button>
          );
        })}
      </div>
    </FieldSet>
  );
}

export function FormChoicesFields({
  choices,
  onChange,
  error,
  isRepeatLocked = false,
  hasLanguages = false,
  idPrefix,
}: {
  readonly choices: CustomFormChoices;
  readonly onChange: (choices: CustomFormChoices) => void;
  readonly error: string | null;
  /** Whether it repeats stays once it was published: its versions belong to seasons or not. */
  readonly isRepeatLocked?: boolean;
  /** The name in every language; the new form dialog asks it in Catalan. */
  readonly hasLanguages?: boolean;
  readonly idPrefix: string;
}) {
  const { t } = useTranslation('settings');
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const nameLanguage = hasLanguages ? language : 'ca';
  return (
    <FieldGroup>
      <Field data-invalid={error !== null}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel htmlFor={`${idPrefix}-name`}>{t('customForms.name')}</FieldLabel>
          {hasLanguages ? (
            <LanguageTabs
              value={language}
              onChange={setLanguage}
              label={t('onboardingBoard.phoneLanguage')}
            />
          ) : null}
        </div>
        <Input
          id={`${idPrefix}-name`}
          lang={nameLanguage}
          dir={getLanguageDirection(nameLanguage)}
          autoComplete="off"
          value={choices.name[nameLanguage] ?? ''}
          placeholder={nameLanguage === 'ca' ? '' : (choices.name.ca ?? '')}
          aria-invalid={error !== null}
          onChange={(event) =>
            onChange({ ...choices, name: { ...choices.name, [nameLanguage]: event.target.value } })
          }
          data-testid={`${idPrefix}-name`}
        />
        {error === null ? null : <FieldError>{error}</FieldError>}
      </Field>
      <ChoiceCards
        legend={t('customForms.filledBy')}
        name={`${idPrefix}-filled-by`}
        value={choices.filledBy}
        options={CUSTOM_FORM_FILLERS.map((filler) => ({
          value: filler,
          title:
            filler === 'entity'
              ? `${t('customForms.filler.entity')} · ${t('customForms.entityUnavailable')}`
              : t(`customForms.filler.${filler}`),
          isDisabled: filler === 'entity',
        }))}
        onChange={(filledBy) => onChange({ ...choices, filledBy })}
        testId={`${idPrefix}-filled-by`}
      />
      <ChoiceCards
        legend={t('customForms.whenToAnswer')}
        name={`${idPrefix}-mandatory`}
        value={choices.mandatory}
        options={CUSTOM_FORM_MANDATORY_LEVELS.map((level) => ({
          value: level,
          title: t(`customForms.level.${level}`),
          line: t(`customForms.levelLine.${level}`),
        }))}
        onChange={(mandatory) => onChange({ ...choices, mandatory })}
        testId={`${idPrefix}-mandatory`}
      />
      {choices.mandatory === 'required_from_date' ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-deadline`}>{t('customForms.deadline')}</FieldLabel>
          <Input
            id={`${idPrefix}-deadline`}
            type="date"
            className="w-fit"
            value={choices.deadline ?? ''}
            onChange={(event) =>
              onChange({
                ...choices,
                deadline: event.target.value === '' ? null : event.target.value,
              })
            }
            data-testid={`${idPrefix}-deadline`}
          />
        </Field>
      ) : null}
      <ChoiceCards
        legend={t('customForms.audience')}
        name={`${idPrefix}-audience`}
        value={choices.audience}
        options={CUSTOM_FORM_AUDIENCES.map((audience) => ({
          value: audience,
          title: t(`customForms.audienceOption.${audience}`),
        }))}
        onChange={(audience) => onChange({ ...choices, audience })}
        testId={`${idPrefix}-audience`}
      />
      <ChoiceCards
        legend={t('customForms.repeats')}
        name={`${idPrefix}-repeats`}
        value={choices.repeatsEachSeason ? 'yes' : 'no'}
        isDisabled={isRepeatLocked}
        options={[
          { value: 'yes', title: t('customForms.repeatsYes'), line: t('customForms.repeatsLine') },
          { value: 'no', title: t('customForms.repeatsNo') },
        ]}
        onChange={(repeats) => onChange({ ...choices, repeatsEachSeason: repeats === 'yes' })}
        testId={`${idPrefix}-repeats`}
      />
    </FieldGroup>
  );
}
