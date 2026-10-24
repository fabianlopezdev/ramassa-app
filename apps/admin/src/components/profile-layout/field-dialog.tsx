/**
 * A field of the Fitxa in a dialog (RAPP-650): new from a section's "Add a
 * field", or opened with Edit. The form writes one language at a time. Its
 * privacy card is locked once the field has answers, and Archive asks first,
 * saying how many answers the field keeps. The onboarding picker (RAPP-651)
 * opens it for a new field, with the section chosen there.
 */

import { FieldForm, type FieldFormDraft } from '@/components/fields/field-form';
import { EditingLanguageContext } from '@/components/fields/language-fields';
import { LanguageTabs } from '@/components/onboarding/language-tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { fieldFormValue, isPrivacyLocked } from '@/lib/profile-layout';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  textIn,
  uploadsAvailable,
  type ProfileField,
  type ProfileSection,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function FieldDialog({
  section,
  field,
  isOpen,
  onOpenChange,
  onSave,
  onArchive,
  answerCount,
}: {
  readonly section: ProfileSection;
  /** Null for a new field in this section. */
  readonly field: ProfileField | null;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (draft: FieldFormDraft) => Promise<unknown>;
  /** Left out where a field is never archived, such as a new one. */
  readonly onArchive?: () => Promise<void>;
  readonly answerCount?: () => Promise<number>;
}) {
  const { t, i18n } = useTranslation('settings');
  const [language, setLanguage] = useState<LanguageCode>('ca');
  const [isConfirming, setIsConfirming] = useState(false);
  const [answers, setAnswers] = useState<number | null>(null);
  const uiLanguage = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const sectionName = textIn(section.title, uiLanguage);

  async function confirmArchive() {
    setAnswers(null);
    setIsConfirming(true);
    try {
      setAnswers(answerCount === undefined ? null : await answerCount());
    } catch {
      // The dialog still asks, without the number.
    }
  }

  async function archive() {
    if (onArchive === undefined) return;
    try {
      await onArchive();
      onOpenChange(false);
      toast.success(t('profileLayout.archived'));
    } catch {
      toast.error(t('questions.failed'));
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) setLanguage('ca');
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl">
        <div className="flex flex-col gap-1">
          <DialogTitle>
            {field === null ? t('profileLayout.newField') : t('profileLayout.editField')}
          </DialogTitle>
          <DialogDescription>{sectionName}</DialogDescription>
        </div>
        <LanguageTabs
          value={language}
          onChange={setLanguage}
          label={t('onboardingBoard.editingLanguage')}
          testId="field-language"
        />
        <EditingLanguageContext.Provider value={language}>
          {/* Keyed by the field, so another field starts from what is saved. */}
          <FieldForm
            key={field?.id ?? 'new'}
            value={field === null ? null : fieldFormValue(field)}
            title={field === null ? t('profileLayout.newField') : t('profileLayout.editField')}
            nameLegend={t('profileLayout.fieldName')}
            submitLabel={t('profileLayout.saveField')}
            isPrivacyLocked={isPrivacyLocked(field)}
            canStoreFiles={uploadsAvailable(mediaWorkerUrl)}
            isFramed={false}
            onSave={async (draft) => {
              await onSave(draft);
            }}
            onCancel={() => onOpenChange(false)}
            secondaryAction={
              field === null || onArchive === undefined ? undefined : (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void confirmArchive()}
                  data-testid="field-archive"
                >
                  {t('questions.archive')}
                </Button>
              )
            }
          />
        </EditingLanguageContext.Provider>
        <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('profileLayout.archiveTitle', {
                  field: field === null ? '' : textIn(field.label, uiLanguage),
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {answers === null
                  ? t('profileLayout.archiveBody')
                  : answers === 0
                    ? t('profileLayout.archiveBodyNone')
                    : t('profileLayout.archiveBodyCount', { count: answers })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('questions.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void archive()}
                data-testid="confirm-archive"
              >
                {t('questions.archive')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
