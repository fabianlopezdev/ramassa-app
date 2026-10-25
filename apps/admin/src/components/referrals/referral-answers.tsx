/**
 * What an entity answered on a referral (RAPP-303, RAPP-652), read-only and by
 * field (RAPP-664): the fields of the referral form in its order, the app's
 * and Ramassà's alike, then any answered field taken off the form since, then
 * her season count. Staff see them before accepting, because accepting fills
 * her record with them; the sending entity sees what it sent while the
 * referral is pending. Staff read each answer as its field's level allows, so
 * a field above their level simply does not appear.
 */

import { useTranslation } from 'react-i18next';
import {
  answerText,
  fieldById,
  placementsOnSurface,
  questionOfField,
  textIn,
  type CustomAnswerValue,
  type IntakeCatalog,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export interface ReferralAnswersProps {
  readonly catalog: IntakeCatalog;
  /** The entity's answers by field id, as the referral read returns them. */
  readonly answers: Readonly<Record<string, unknown>>;
  readonly seasonNumber: number | null;
}

/** The answered fields: the form's in its order, then the others in the Fitxa's order. */
function answeredFieldIds(catalog: IntakeCatalog, answers: Readonly<Record<string, unknown>>) {
  const layout = catalog.layout;
  if (layout === undefined) return [];
  const onForm = placementsOnSurface(layout, 'entity_form').map((placement) => placement.fieldId);
  const others = layout.fields.map((field) => field.id).filter((id) => !onForm.includes(id));
  return [...onForm, ...others].filter((id) => answers[id] !== undefined && answers[id] !== null);
}

export function ReferralAnswers({ catalog, answers, seasonNumber }: ReferralAnswersProps) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const words = {
    yes: t('settings:questions.answers.yes'),
    no: t('settings:questions.answers.no'),
    maybe: t('settings:questions.answers.maybe'),
    archived: t('settings:questions.archivedOption'),
  };
  const layout = catalog.layout;
  const rows = [
    ...(layout === undefined
      ? []
      : answeredFieldIds(catalog, answers).flatMap((id) => {
          const field = fieldById(layout, id);
          if (field === undefined) return [];
          return [
            {
              key: id,
              label: textIn(field.label, language),
              value: answerText(
                questionOfField(layout, field),
                answers[id] as CustomAnswerValue,
                language,
                words,
              ),
            },
          ];
        })),
    ...(seasonNumber === null
      ? []
      : [
          {
            key: 'season_number',
            label: t('onboarding:seasonNumberLabel'),
            value: t(`onboarding:seasonNumber${seasonNumber}`),
          },
        ]),
  ];
  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2" data-testid="referral-answers">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col">
          <dt className="text-start text-xs text-muted-foreground">{row.label}</dt>
          <dd className="text-start text-sm" dir="auto">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
