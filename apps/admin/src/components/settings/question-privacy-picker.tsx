/**
 * The privacy level of a question, picked from three cards (RAPP-647): each
 * card says who on the team reads her answers at that level, as the database
 * enforces it (`participant_custom_answers`, `private.write_custom_answer` and
 * `create_data_export`). The level is set once, so the dialog says so, and an
 * existing question shows its card without Change.
 */

import { PRIVACY_LEVEL_CLASSES } from '@/components/fields/privacy-badge';
import { CardPickerField, CardRadioGroup } from '@/components/settings/card-picker';
import { cn } from '@/lib/utils';
import { IdCard, LockKeyhole, Users, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QUESTION_PRIVACY_LEVELS, type QuestionPrivacy } from '@ramassa/shared/intake-builder';

const LEVEL_ICONS: Readonly<Record<QuestionPrivacy, LucideIcon>> = {
  normal: Users,
  personal: IdCard,
  sensitive: LockKeyhole,
};

function LevelIcon({ level }: { readonly level: QuestionPrivacy }) {
  const Icon = LEVEL_ICONS[level];
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg',
        PRIVACY_LEVEL_CLASSES[level],
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}

export function QuestionPrivacyPicker({
  value,
  onChange,
  isLocked,
}: {
  readonly value: QuestionPrivacy;
  readonly onChange: (level: QuestionPrivacy) => void;
  /** Her names keep their level (D2): the card shows without Change. */
  readonly isLocked: boolean;
}) {
  const { t } = useTranslation('settings');
  const note = (level: QuestionPrivacy) => t(`questions.privacyNotes.${level}`);
  const example = (level: QuestionPrivacy) => t(`questions.privacyExamples.${level}`);
  // Who sees it, then what kind of question belongs there.
  const describe = (level: QuestionPrivacy) => `${note(level)} ${example(level)}`;
  return (
    <CardPickerField
      label={t('questions.privacy')}
      value={value}
      onChange={onChange}
      isLocked={isLocked}
      media={
        <div className="flex aspect-[4/3] w-28 shrink-0 items-center justify-center rounded-lg border bg-canvas">
          <LevelIcon level={value} />
        </div>
      }
      name={t(`questions.privacyLevels.${value}`)}
      description={
        <span className="flex flex-col gap-0.5 text-start text-xs font-normal text-muted-foreground">
          <span>{note(value)}</span>
          <span className="italic">{example(value)}</span>
        </span>
      }
      dialogClassName="max-w-3xl"
      dialogNote={t('questions.privacyPermanent')}
      testId="question-privacy"
      hiddenName="question-privacy"
      renderGroup={({ cardRefs, pick }) => (
        <CardRadioGroup
          values={QUESTION_PRIVACY_LEVELS}
          value={value}
          label={t('questions.privacy')}
          describe={describe}
          onPick={pick}
          cardRefs={cardRefs}
          className="grid-cols-1 sm:grid-cols-3"
          testId="question-privacy-option"
        >
          {(level) => (
            <span className="flex flex-1 flex-col gap-2 p-2">
              <LevelIcon level={level} />
              <span className="text-sm leading-5 font-medium">
                {t(`questions.privacyLevels.${level}`)}
              </span>
              <span aria-hidden className="text-xs leading-4 text-muted-foreground">
                {note(level)}
              </span>
              {/* Pinned to the bottom, so the three examples line up. */}
              <span aria-hidden className="mt-auto text-xs leading-4 text-muted-foreground italic">
                {example(level)}
              </span>
            </span>
          )}
        </CardRadioGroup>
      )}
    />
  );
}
