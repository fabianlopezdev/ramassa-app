/**
 * The season documents of the season authorization's document screen
 * (RAPP-773): up to ten https links, each with its name in five languages
 * (Catalan required). Her phone lists them on that screen. They were edited
 * on the authorization's document screen before it moved onto the form
 * engine, and stay there. Saving is the form's draft, like every change on
 * its screens.
 */

import { LanguageFields, textFromForm } from '@/components/fields/language-fields';
import { EditorSection } from '@/components/layout/editor-section';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { saveFormScreenAttachments, type FormAttachment } from '@ramassa/shared/intake-builder';

const MAX_ATTACHMENTS = 10;
const HTTPS_LINK = /^https:\/\/\S+$/u;

export function FormAttachmentsSection({
  screenId,
  attachments,
}: {
  readonly screenId: string;
  readonly attachments: readonly FormAttachment[];
}) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  // One row per document, each with a stable key so its typed boxes stay with it.
  const [rows, setRows] = useState(() =>
    attachments.map((attachment, index) => ({ key: index, saved: attachment })),
  );
  const [nextKey, setNextKey] = useState(attachments.length);
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const typed = rows.map((row) => ({
      label: textFromForm(fields, `attachment-label-${row.key}`),
      url: String(fields.get(`attachment-url-${row.key}`) ?? '').trim(),
    }));
    if (typed.some((each) => (each.label.ca ?? '') === '' || !HTTPS_LINK.test(each.url))) {
      toast.error(t('authorizationAttachmentInvalid'));
      return;
    }
    setIsSaving(true);
    try {
      await saveFormScreenAttachments(supabase, screenId, typed);
      await reload();
      toast.success(t('customForms.draftSaved'));
    } catch {
      toast.error(t('customForms.actionFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} data-testid="form-attachments">
      <EditorSection
        title={t('authorizationAttachments')}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={rows.length >= MAX_ATTACHMENTS}
              onClick={() => {
                setRows([
                  ...rows,
                  { key: nextKey, saved: { label: {}, url: 'https://' } satisfies FormAttachment },
                ]);
                setNextKey(nextKey + 1);
              }}
              data-testid="form-attachments-add"
            >
              {t('authorizationAddAttachment')}
            </Button>
            <Button type="submit" disabled={isSaving} data-testid="form-attachments-save">
              {t('customForms.saveDraft')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {rows.map((row) => (
            <div key={row.key} className="flex flex-col gap-2" data-testid="form-attachment">
              <LanguageFields
                name={`attachment-label-${row.key}`}
                legend={t('authorizationAttachmentLabel')}
                value={row.saved.label}
                isCatalanRequired
              />
              <div className="flex items-center gap-2">
                <Input
                  name={`attachment-url-${row.key}`}
                  type="url"
                  dir="ltr"
                  aria-label={t('authorizationAttachmentUrl')}
                  placeholder={t('authorizationAttachmentUrl')}
                  defaultValue={row.saved.url}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('authorizationRemoveAttachment')}
                  title={t('authorizationRemoveAttachment')}
                  onClick={() => setRows(rows.filter((each) => each.key !== row.key))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </EditorSection>
    </form>
  );
}
