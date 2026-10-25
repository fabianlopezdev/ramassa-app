/**
 * The type of a question, picked by its picture (RAPP-646): every type as a
 * tile with a small drawing of her phone's control, answered with sample
 * words, and its name. The form shows the chosen tile with Change; Change
 * opens all fifteen in a dialog.
 *
 * The drawings are `QuestionControl`, the control the editor's phone preview
 * draws, in its example mode. The tiles are a radio group: arrow keys move
 * across the grid (mirrored right to left), Enter or Space picks, Escape
 * closes (`CardRadioGroup`). A type that cannot be used here shows its tile
 * disabled with the reason; a type that works with a caveat keeps its tile
 * and says why.
 */

import { CardPickerField, CardRadioGroup } from '@/components/settings/card-picker';
import { QuestionControl, TypeDescription } from '@/components/settings/question-type-fields';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getLanguageDirection, SUPPORTED_LANGUAGES } from '@ramassa/shared/i18n/languages';
import {
  BUILDER_QUESTION_TYPES,
  type BuilderText,
  type CustomQuestionType,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** Why a type cannot be picked here, or what to know before picking it, by type. */
export type TypeNotes = Partial<Record<CustomQuestionType, string>>;

/** The admin's own language, so the pictures read in it. */
function useUiLanguage(): LanguageCode {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'ca';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(language)
    ? (language as LanguageCode)
    : 'ca';
}

/** One type drawn small, answered with sample words in the admin's language. */
function TypeMiniature({
  type,
  language,
}: {
  readonly type: CustomQuestionType;
  readonly language: LanguageCode;
}) {
  const { t } = useTranslation('settings');
  const sample = (key: string): BuilderText => ({
    [language]: t(`questions.typeSamples.${key}`, { lng: language }),
  });
  const options =
    type === 'single_choice' || type === 'multiple_choice'
      ? [sample('option1'), sample('option2'), sample('option3')]
      : type === 'search_choice'
        ? [sample('search1'), sample('search2')]
        : [];
  return (
    <div
      aria-hidden
      inert
      lang={language}
      dir={getLanguageDirection(language)}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-canvas"
    >
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-2 px-3 [zoom:0.6]">
        <span className="h-2 w-1/2 shrink-0 rounded-full bg-foreground/15" />
        <QuestionControl
          draft={{
            type,
            label: {},
            help: {},
            settings: type === 'file_upload' ? { accept: 'document' } : {},
            options,
          }}
          language={language}
          isExample
        />
      </div>
    </div>
  );
}

/**
 * The type field of the question form: the chosen tile, and Change for the
 * grid on every field but her names. A hidden `question-type` input carries the
 * value in the form, as the dropdown did.
 */
export function QuestionTypePicker({
  value,
  onChange,
  isLocked,
  disabled = {},
  warnings = {},
}: {
  readonly value: CustomQuestionType;
  readonly onChange: (type: CustomQuestionType) => void;
  /** Her names keep their type (D2): the tile shows without Change. */
  readonly isLocked: boolean;
  readonly disabled?: TypeNotes;
  readonly warnings?: TypeNotes;
}) {
  const { t } = useTranslation('settings');
  const language = useUiLanguage();
  return (
    <CardPickerField
      label={t('questions.type')}
      value={value}
      onChange={onChange}
      isLocked={isLocked}
      media={
        <div className="w-28 shrink-0">
          <TypeMiniature type={value} language={language} />
        </div>
      }
      name={t(`questions.types.${value}`)}
      description={<TypeDescription type={value} />}
      dialogClassName="max-w-4xl"
      testId="question-type"
      hiddenName="question-type"
      renderGroup={({ cardRefs, pick }) => (
        <CardRadioGroup
          values={BUILDER_QUESTION_TYPES}
          value={value}
          label={t('questions.type')}
          disabled={disabled}
          describe={(type) =>
            [t(`questions.typeHelp.${type}`), warnings[type]].filter(Boolean).join(' ')
          }
          tooltip={(type) => warnings[type]}
          onPick={pick}
          cardRefs={cardRefs}
          className="grid-cols-3 md:grid-cols-5"
          testId="question-type-option"
        >
          {(type) => (
            <>
              <span className="relative block w-full">
                <TypeMiniature type={type} language={language} />
                {warnings[type] === undefined && disabled[type] === undefined ? null : (
                  <TriangleAlert
                    aria-hidden
                    className="absolute end-1.5 top-1.5 size-4 rounded-full bg-card p-0.5 text-destructive"
                  />
                )}
              </span>
              <span className="line-clamp-3 min-h-15 text-sm leading-5 font-medium md:line-clamp-2 md:min-h-10">
                {t(`questions.types.${type}`)}
              </span>
            </>
          )}
        </CardRadioGroup>
      )}
    />
  );
}
