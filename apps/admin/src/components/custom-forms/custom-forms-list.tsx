/**
 * The pages that list forms (RAPP-700, RAPP-771): Altres formularis lists the
 * forms of kind Altre, Condicions legals the legal ones, the app's two legal
 * forms first. Each page has Nou formulari; both open the same dialog, which
 * asks the kind first (preset by the page), the name and the choices
 * (RAPP-701), creates the form as a draft and opens its board. Each row opens
 * its form.
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
import {
  ClipboardList,
  FileSignature,
  Plus,
  Scale,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createCustomForm,
  textIn,
  type CustomFormChoices,
  type CustomFormKind,
} from '@ramassa/shared/intake-builder';
import type { LanguageCode } from '@ramassa/shared/schemas';

export function CustomFormsList({
  data,
  kind,
}: {
  readonly data: CustomFormsData;
  readonly kind: CustomFormKind;
}) {
  const { t, i18n } = useTranslation(['settings', 'nav']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const [isCreating, setIsCreating] = useState(false);
  // The app's own legal forms open their own boards until they move onto this engine.
  const forms = (data.intakeCatalog.customForms ?? []).filter(
    (form) => form.kind === kind && form.systemKey === null,
  );
  const title = kind === 'legal' ? t('nav:staff.legal') : t('customForms.title');
  const appLegalForms =
    kind === 'legal' && data.canDesign
      ? [
          { to: '/forms/authorization', icon: FileSignature, name: t('nav:staff.authorization') },
          { to: '/forms/terms', icon: ScrollText, name: t('nav:staff.appTerms') },
        ]
      : [];
  return (
    <Page data-testid={kind === 'legal' ? 'legal-forms-page' : 'custom-forms-page'}>
      <PageHeader
        title={title}
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
        {forms.length + appLegalForms.length === 0 ? (
          <p className="px-5 py-5 text-start text-sm text-muted-foreground">
            {t('customForms.empty')}
          </p>
        ) : (
          <ol className="flex flex-col divide-y" aria-label={t('customForms.listLabel')}>
            {appLegalForms.map((form) => (
              <li key={form.to} className="bg-card">
                <Link to={form.to} className={ROW_CLASS} data-testid={`legal-form-row-${form.to}`}>
                  <FormRowContent
                    icon={form.icon}
                    name={form.name}
                    line={t('customForms.kindOption.legal')}
                    badge={null}
                  />
                </Link>
              </li>
            ))}
            {forms.map((form) => (
              <li key={form.id} className="bg-card">
                <Link
                  to="/forms/custom/$formId"
                  params={{ formId: form.id }}
                  className={ROW_CLASS}
                  data-testid={`custom-form-row-${form.id}`}
                >
                  <FormRowContent
                    icon={kind === 'legal' ? Scale : ClipboardList}
                    name={textIn(form.name, language)}
                    line={[
                      t(`customForms.level.${form.mandatory}`),
                      t(`customForms.audienceOption.${form.audience}`),
                      ...(form.repeatsEachSeason ? [t('customForms.repeatsYes')] : []),
                    ].join(' · ')}
                    badge={<FormStatusBadge form={form} />}
                  />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </EditorSection>
      {data.canDesign ? (
        <NewFormDialog kind={kind} isOpen={isCreating} onOpenChange={setIsCreating} />
      ) : null}
    </Page>
  );
}

const ROW_CLASS =
  'flex min-h-16 items-center gap-3 px-5 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50';

/** One form of a list inside its link: its icon, name, choices and status. */
function FormRowContent({
  icon: Icon,
  name,
  line,
  badge,
}: {
  readonly icon: LucideIcon;
  readonly name: string;
  readonly line: string;
  readonly badge: ReactNode;
}) {
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-start text-sm font-medium">{name}</span>
        <span className="truncate text-start text-xs text-muted-foreground">{line}</span>
      </span>
      {badge}
    </>
  );
}

function newForm(kind: CustomFormKind): CustomFormChoices {
  return {
    kind,
    name: {},
    filledBy: 'player',
    mandatory: 'optional',
    deadline: null,
    audience: 'all',
    repeatsEachSeason: false,
  };
}

/** Nou formulari: the same dialog on both pages, its kind preset by the page. */
function NewFormDialog({
  kind,
  isOpen,
  onOpenChange,
}: {
  readonly kind: CustomFormKind;
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const [choices, setChoices] = useState<CustomFormChoices>(() => newForm(kind));
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
      setChoices(newForm(kind));
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
