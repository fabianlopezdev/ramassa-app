/**
 * A survey's question (RAPP-929), new on a screen or saved again: the shared
 * question form in its survey mode (a survey's types, rating first, no
 * privacy). The question belongs to its survey and never to a section of her
 * record, so it is saved with `saveSurveyQuestion`, which also places a new
 * one on the screen.
 */
import { FieldForm, type FieldFormDraft } from '@/components/fields/field-form';
import { EditingLanguageContext } from '@/components/fields/language-fields';
import { LanguageTabs } from '@/components/onboarding/language-tabs';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fieldFormValue } from '@/lib/profile-layout';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { saveSurveyQuestion, type ProfileField } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function SurveyQuestionDialog({
  screenId,
  field,
  isOpen,
  onOpenChange,
}: {
  readonly screenId: string;
  /** Null for a new question on this screen. */
  readonly field: ProfileField | null;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const title = field === null ? t('surveyQuestion.new') : t('surveyQuestion.edit');

  async function save(draft: FieldFormDraft): Promise<void> {
    await saveSurveyQuestion(supabase, {
      id: field?.id ?? null,
      screenId,
      type: draft.type,
      label: draft.label,
      help: draft.help,
      required: field?.defaultRequired ?? false,
      options: draft.options.map((option) =>
        option.id === null ? { label: option.label } : { id: option.id, label: option.label },
      ),
      settings: draft.settings as Readonly<Record<string, unknown>>,
    });
    await reload();
    onOpenChange(false);
    toast.success(t('surveyQuestion.saved'));
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) setLanguage('ca');
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="survey-question-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        <LanguageTabs
          value={language}
          onChange={setLanguage}
          label={t('onboardingBoard.editingLanguage')}
          testId="survey-question-language"
        />
        <EditingLanguageContext.Provider value={language}>
          {/* Keyed by the question, so another one starts from what is saved. */}
          <FieldForm
            key={field?.id ?? 'new'}
            value={field === null ? null : fieldFormValue(field)}
            title={title}
            nameLegend={t('surveyQuestion.label')}
            submitLabel={t('surveyQuestion.save')}
            canStoreFiles={false}
            isFramed={false}
            isSurveyQuestion
            onSave={save}
            onCancel={() => onOpenChange(false)}
            testId="survey-question-form"
          />
        </EditingLanguageContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
