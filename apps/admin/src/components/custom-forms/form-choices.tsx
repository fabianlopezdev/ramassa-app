/**
 * The name and the three choices of a form the team creates (RAPP-700): who
 * fills it, how mandatory it is (with its date) and when it appears. The new
 * form dialog asks them, and the form's Configuració tab edits them.
 *
 * The mandatory levels say plainly what each does, in Fabián's words. A form
 * an entity fills in is shown and not available yet: the entity portal has one
 * referral form today.
 */

import { LanguageTabs } from '@/components/onboarding/language-tabs';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection } from '@ramassa/shared/i18n/languages';
import {
  CUSTOM_FORM_APPEARANCES,
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

export function FormChoicesFields({
  choices,
  onChange,
  error,
  isFillerLocked = false,
  isAppearanceLocked = false,
  hasLanguages = false,
  idPrefix,
}: {
  readonly choices: CustomFormChoices;
  readonly onChange: (choices: CustomFormChoices) => void;
  readonly error: string | null;
  /** Who fills it stays once anyone was asked. */
  readonly isFillerLocked?: boolean;
  /** When it appears stays once it started. */
  readonly isAppearanceLocked?: boolean;
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
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-filled-by`}>{t('customForms.filledBy')}</FieldLabel>
        <Select
          value={choices.filledBy}
          disabled={isFillerLocked}
          onValueChange={(value) =>
            onChange({ ...choices, filledBy: value as CustomFormChoices['filledBy'] })
          }
        >
          <SelectTrigger id={`${idPrefix}-filled-by`} data-testid={`${idPrefix}-filled-by`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOM_FORM_FILLERS.map((filler) => (
              <SelectItem key={filler} value={filler} disabled={filler === 'entity'}>
                {filler === 'entity'
                  ? `${t('customForms.filler.entity')} · ${t('customForms.entityUnavailable')}`
                  : t(`customForms.filler.${filler}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-mandatory`}>{t('customForms.mandatory')}</FieldLabel>
        <Select
          value={choices.mandatory}
          onValueChange={(value) =>
            onChange({ ...choices, mandatory: value as CustomFormChoices['mandatory'] })
          }
        >
          <SelectTrigger id={`${idPrefix}-mandatory`} data-testid={`${idPrefix}-mandatory`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOM_FORM_MANDATORY_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {t(`customForms.level.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
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
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-appears`}>{t('customForms.appears')}</FieldLabel>
        <Select
          value={choices.appears}
          disabled={isAppearanceLocked}
          onValueChange={(value) =>
            onChange({ ...choices, appears: value as CustomFormChoices['appears'] })
          }
        >
          <SelectTrigger id={`${idPrefix}-appears`} data-testid={`${idPrefix}-appears`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOM_FORM_APPEARANCES.map((appears) => (
              <SelectItem key={appears} value={appears}>
                {t(`customForms.appearance.${appears}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}
