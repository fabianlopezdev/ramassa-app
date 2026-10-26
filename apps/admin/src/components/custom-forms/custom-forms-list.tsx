/**
 * Formularis de l'equip (RAPP-700): every form the team created, with Nou
 * formulari. Nou formulari asks the name and the choices (RAPP-701), creates
 * the form as a draft and opens its board. Each row opens its form.
 */

import { FormStatusBadge } from '@/components/custom-forms/custom-form-page';
import { choicesProblem, FormChoicesFields } from '@/components/custom-forms/form-choices';
import { EditorSection } from '@/components/layout/editor-section';
import { Page, PageHeader } from '@/components/layout/page';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { CustomFormsData } from '@/lib/custom-forms';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from '@tanstack/react-router';
import { ClipboardList, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { createCustomForm, textIn, type CustomFormChoices } from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function CustomFormsList({ data }: { readonly data: CustomFormsData }) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const [isCreating, setIsCreating] = useState(false);
  const forms = data.intakeCatalog.customForms ?? [];
  return (
    <Page data-testid="custom-forms-page">
      <PageHeader
        title={t('customForms.title')}
        actions={
          data.canDesign ? (
            <Button type="button" onClick={() => setIsCreating(true)} data-testid="custom-form-new">
              <Plus aria-hidden data-icon="inline-start" />
              {t('customForms.newForm')}
            </Button>
          ) : undefined
        }
      />
      <EditorSection title={t('customForms.listLabel')} isFlush testId="custom-forms-list">
        {forms.length === 0 ? (
          <p className="px-5 py-5 text-start text-sm text-muted-foreground">
            {t('customForms.empty')}
          </p>
        ) : (
          <ol className="flex flex-col divide-y" aria-label={t('customForms.listLabel')}>
            {forms.map((form) => (
              <li key={form.id} className="bg-card">
                <Link
                  to="/forms/custom/$formId"
                  params={{ formId: form.id }}
                  className="flex min-h-16 items-center gap-3 px-5 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                  data-testid={`custom-form-row-${form.id}`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <ClipboardList aria-hidden className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-start text-sm font-medium">
                      {textIn(form.name, language)}
                    </span>
                    <span className="truncate text-start text-xs text-muted-foreground">
                      {[
                        t(`customForms.level.${form.mandatory}`),
                        t(`customForms.audienceOption.${form.audience}`),
                        ...(form.repeatsEachSeason ? [t('customForms.repeatsYes')] : []),
                      ].join(' · ')}
                    </span>
                  </span>
                  <FormStatusBadge form={form} />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </EditorSection>
      {data.canDesign ? <NewFormDialog isOpen={isCreating} onOpenChange={setIsCreating} /> : null}
    </Page>
  );
}

const NEW_FORM: CustomFormChoices = {
  name: {},
  filledBy: 'player',
  mandatory: 'optional',
  deadline: null,
  audience: 'all',
  repeatsEachSeason: false,
};

function NewFormDialog({
  isOpen,
  onOpenChange,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const [choices, setChoices] = useState<CustomFormChoices>(NEW_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = choicesProblem(choices);
    if (problem !== null) {
      setError(t(problem));
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const id = await createCustomForm(supabase, {
        ...choices,
        name: { ca: (choices.name.ca ?? '').trim() },
      });
      onOpenChange(false);
      setChoices(NEW_FORM);
      await navigate({ to: '/forms/custom/$formId', params: { formId: id } });
    } catch {
      setError(t('customForms.createFailed'));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setError(null);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle>{t('customForms.newForm')}</DialogTitle>
        <DialogDescription className="sr-only">{t('customForms.newForm')}</DialogDescription>
        <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)} noValidate>
          <FormChoicesFields
            choices={choices}
            onChange={setChoices}
            error={error}
            idPrefix="new-form"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('customForms.cancel')}
            </Button>
            <Button type="submit" disabled={isBusy} data-testid="new-form-create">
              {t('customForms.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
