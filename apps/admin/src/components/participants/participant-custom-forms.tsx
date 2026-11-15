/**
 * Her forms (RAPP-700, RAPP-701): the forms the team created that asked her,
 * each pending, answered or dismissed. She fills every form in herself; the
 * team edits her answers on her page as any other answer.
 *
 * Only staff with participants.view_personal read them, as the database does.
 */

import { EditorSection } from '@/components/layout/editor-section';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { textIn, type ParticipantCustomForm } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function ParticipantCustomForms({
  forms,
}: {
  readonly forms: readonly ParticipantCustomForm[];
}) {
  const { t, i18n } = useTranslation('participants');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  // Her latest ask of each form.
  const latest = forms.filter(
    (form, index) => forms.findIndex((each) => each.formId === form.formId) === index,
  );
  if (latest.length === 0) return null;
  return (
    <EditorSection title={t('herForms.title')} isFlush testId="her-forms">
      <ul className="flex flex-col divide-y">
        {latest.map((asked) => (
          <li key={asked.responseId} className="flex min-h-12 items-center gap-3 px-5 py-2">
            <span className="min-w-0 flex-1 truncate text-start text-sm font-medium">
              {textIn(asked.name, language)}
            </span>
            <Badge variant={asked.status === 'pending' ? 'outline' : 'secondary'}>
              {t(`herForms.status.${asked.status}`)}
            </Badge>
          </li>
        ))}
      </ul>
    </EditorSection>
  );
}
