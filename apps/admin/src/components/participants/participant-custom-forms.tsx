/**
 * Her forms (RAPP-700): the forms the team created that ask her.
 *
 *   - A team form shows its fields as the Fitxa's rows (`ProfileSection`),
 *     each answer edited with the one answer editor and saved through her
 *     record. "Marca com a fet" closes the ask once its required answers are
 *     in; the database checks them again.
 *   - A form she fills in shows whether it is pending or answered.
 *
 * Only staff with participants.view_personal read them, as the database does.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { ProfileSection, type FitxaContext } from '@/components/participants/profile-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fieldById,
  placementsOnSurface,
  textIn,
  type CustomForm,
  type IntakeCatalog,
  type ParticipantCustomForm,
  type ProfileField,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** The fields a form asks on its live screens, in its order. */
function formFields(catalog: IntakeCatalog, form: CustomForm): readonly ProfileField[] {
  const layout = catalog.layout;
  if (layout === undefined) return [];
  return form.screens.flatMap((screen) =>
    placementsOnSurface(layout, 'custom_form', screen.id).flatMap((placement) => {
      const field = fieldById(layout, placement.fieldId);
      return field === undefined ? [] : [field];
    }),
  );
}

export function ParticipantCustomForms({
  forms,
  catalog,
  context,
  onComplete,
}: {
  readonly forms: readonly ParticipantCustomForm[];
  readonly catalog: IntakeCatalog;
  /** The Fitxa's rows' context, so a team form's rows read and save as hers do. */
  readonly context: FitxaContext;
  /** Throws when the database refuses: a required answer is missing. */
  readonly onComplete: (responseId: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation('participants');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  // Her latest ask of each form.
  const latest = forms.filter(
    (form, index) => forms.findIndex((each) => each.formId === form.formId) === index,
  );
  const teamForms = latest.flatMap((asked) => {
    const form = (catalog.customForms ?? []).find((each) => each.id === asked.formId);
    return asked.filledBy === 'team' && form !== undefined ? [{ asked, form }] : [];
  });
  const herForms = latest.filter((asked) => asked.filledBy !== 'team');
  const status = (asked: ParticipantCustomForm) => (
    <Badge variant={asked.status === 'pending' ? 'outline' : 'secondary'}>
      {t(`herForms.status.${asked.status}`)}
    </Badge>
  );

  return (
    <>
      {teamForms.map(({ asked, form }) => (
        <ProfileSection
          key={asked.responseId}
          section={{ id: form.id, key: form.id, title: form.name, isBuiltin: false }}
          fields={formFields(catalog, form)}
          context={context}
          testId={`her-form-${form.id}`}
          title={
            <span className="flex items-center gap-2">
              <span className="text-start text-base font-semibold">
                {textIn(form.name, language)}
              </span>
              {status(asked)}
            </span>
          }
          footer={
            asked.status === 'pending' && context.canEdit ? (
              <MarkDone onMark={() => onComplete(asked.responseId)} />
            ) : undefined
          }
        />
      ))}
      {herForms.length === 0 ? null : (
        <EditorSection title={t('herForms.title')} isFlush testId="her-forms">
          <ul className="flex flex-col divide-y">
            {herForms.map((asked) => (
              <li key={asked.responseId} className="flex min-h-12 items-center gap-3 px-5 py-2">
                <span className="min-w-0 flex-1 truncate text-start text-sm font-medium">
                  {textIn(asked.name, language)}
                </span>
                <span className="text-xs text-muted-foreground">{t('herForms.byHer')}</span>
                {status(asked)}
              </li>
            ))}
          </ul>
        </EditorSection>
      )}
    </>
  );
}

function MarkDone({ onMark }: { readonly onMark: () => Promise<void> }) {
  const { t } = useTranslation('participants');
  const [isBusy, setIsBusy] = useState(false);
  return (
    <Button
      type="button"
      disabled={isBusy}
      onClick={() => {
        setIsBusy(true);
        onMark()
          .then(() => toast.success(t('herForms.markedDone')))
          .catch(() => toast.error(t('herForms.markFailed')))
          .finally(() => setIsBusy(false));
      }}
      data-testid="her-form-done"
    >
      {t('herForms.markDone')}
    </Button>
  );
}
