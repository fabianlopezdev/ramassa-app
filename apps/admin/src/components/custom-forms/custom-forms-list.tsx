/**
 * The pages that list forms (RAPP-700, RAPP-771): Altres formularis lists the
 * forms of kind Altre, Condicions legals the legal ones, the app's two legal
 * forms first: the season authorization (RAPP-773) and the app terms
 * (RAPP-772), forms of the engine like the rest. Each page has Nou formulari; both open the same dialog, which
 * asks the kind first (preset by the page), the name and the choices
 * (RAPP-701), creates the form as a draft and opens its board. Each row opens
 * its form.
 */

import { FormStatusBadge } from '@/components/custom-forms/custom-form-page';
import { choicesProblem, FormChoicesFields } from '@/components/custom-forms/form-choices';
import { EditorSection } from '@/components/layout/editor-section';
import { Page, PageHeader } from '@/components/layout/page';
import { ParticipantChecklist } from '@/components/notifications/participant-checklist';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { CustomFormsData } from '@/lib/custom-forms';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  BarChart3,
  ClipboardList,
  FileSignature,
  Plus,
  Scale,
  ScrollText,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@ramassa/shared/auth';
import {
  createCustomForm,
  setCustomFormRecipients,
  textIn,
  type CustomFormChoices,
  type CustomFormKind,
} from '@ramassa/shared/intake-builder';
import {
  fetchNotificationAudienceOptions,
  type NotificationAudienceOptions,
} from '@ramassa/shared/notifications';
import type { LanguageCode } from '@ramassa/shared/schemas';

const SYSTEM_FORM_ORDER = ['season_authorization', 'app_terms'] as const;

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
  const forms = (data.intakeCatalog.customForms ?? []).filter(
    (form) => form.kind === kind && form.systemKey === null,
  );
  // The app's own legal forms come first: the authorization, then the terms.
  const systemForms =
    kind === 'legal' && data.canDesign
      ? SYSTEM_FORM_ORDER.flatMap((key) =>
          (data.intakeCatalog.customForms ?? []).filter((form) => form.systemKey === key),
        )
      : [];
  const isSurveys = kind === 'survey';
  const { permissions } = useAuth();
  const readsOldSurveys = permissions.has('surveys.manage') || permissions.has('surveys.results');
  const title =
    kind === 'legal'
      ? t('nav:staff.legal')
      : isSurveys
        ? t('nav:staff.surveys')
        : t('customForms.title');
  return (
    <Page
      data-testid={
        kind === 'legal' ? 'legal-forms-page' : isSurveys ? 'surveys-page' : 'custom-forms-page'
      }
    >
      <PageHeader
        title={title}
        actions={
          <>
            {/* The surveys made before the form engine, for the people who had surveys (RAPP-934). */}
            {isSurveys && readsOldSurveys ? (
              <Button asChild variant="outline">
                <Link to="/surveys/archive" data-testid="surveys-archive">
                  {t('surveyList.archive')}
                </Link>
              </Button>
            ) : null}
            {data.canDesign ? (
              <Button
                type="button"
                onClick={() => setIsCreating(true)}
                data-testid="custom-form-new"
              >
                <Plus aria-hidden data-icon="inline-start" />
                {isSurveys ? t('surveyList.new') : t('customForms.newForm')}
              </Button>
            ) : null}
          </>
        }
      />
      <EditorSection
        title={isSurveys ? t('surveyList.listLabel') : t('customForms.listLabel')}
        isFlush
        testId="custom-forms-list"
      >
        {forms.length + systemForms.length === 0 ? (
          <p className="px-5 py-5 text-start text-sm text-muted-foreground">
            {isSurveys ? t('surveyList.empty') : t('customForms.empty')}
          </p>
        ) : (
          <ol
            className="flex flex-col divide-y"
            aria-label={isSurveys ? t('surveyList.listLabel') : t('customForms.listLabel')}
          >
            {systemForms.map((form) => (
              <li key={form.id} className="bg-card">
                <Link
                  to="/forms/custom/$formId"
                  params={{ formId: form.id }}
                  className={ROW_CLASS}
                  data-testid={`legal-form-row-${form.systemKey ?? form.id}`}
                >
                  <FormRowContent
                    icon={form.systemKey === 'app_terms' ? ScrollText : FileSignature}
                    name={textIn(form.name, language)}
                    line={t('customForms.kindOption.legal')}
                    badge={<FormStatusBadge form={form} />}
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
                    icon={kind === 'legal' ? Scale : isSurveys ? BarChart3 : ClipboardList}
                    name={textIn(form.name, language)}
                    line={[
                      ...(isSurveys ? [] : [t(`customForms.level.${form.mandatory}`)]),
                      t(`customForms.audienceOption.${form.audience}`),
                      ...(form.repeatsEachSeason ? [t('customForms.repeatsEverySeason')] : []),
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
  // A form for chosen players asks them right after Crea (RAPP-928).
  const [choosingFor, setChoosingFor] = useState<string | null>(null);
  const openForm = (formId: string) =>
    void navigate({ to: '/forms/custom/$formId', params: { formId } });

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
      if (choices.audience === 'chosen') setChoosingFor(id);
      else openForm(id);
    } catch {
      setError(t('customForms.createFailed'));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <ChoosePlayersDialog
        formId={choosingFor}
        onDone={(formId) => {
          setChoosingFor(null);
          openForm(formId);
        }}
      />
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setError(null);
          onOpenChange(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>
            {kind === 'survey' ? t('surveyList.new') : t('customForms.newForm')}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('customForms.newForm')}</DialogDescription>
          <form className="flex flex-col gap-6" onSubmit={(event) => void submit(event)} noValidate>
            <FormChoicesFields
              choices={choices}
              onChange={setChoices}
              error={error}
              isSurvey={kind === 'survey'}
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
    </>
  );
}

/**
 * Escull les jugadores (RAPP-928): right after Crea, for a form whose players
 * the team picks, a search box and a list to tick. Desa saves them as the
 * form's players (a draft, as every change: they are asked at Publica); Ara no
 * leaves them for Configuració.
 */
function ChoosePlayersDialog({
  formId,
  onDone,
}: {
  readonly formId: string | null;
  readonly onDone: (formId: string) => void;
}) {
  const { t } = useTranslation('settings');
  const [participants, setParticipants] = useState<NotificationAudienceOptions['participants']>([]);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (formId === null) return;
    setChosen([]);
    const controller = new AbortController();
    void fetchNotificationAudienceOptions(supabase, controller.signal)
      .then((options) => setParticipants(options.participants))
      .catch(() => undefined);
    return () => controller.abort();
  }, [formId]);

  async function save() {
    if (formId === null) return;
    setIsBusy(true);
    try {
      const count = await setCustomFormRecipients(supabase, formId, {
        kind: 'players',
        participantIds: chosen,
      });
      toast.success(t('customForms.recipientsSaved', { count }));
      onDone(formId);
    } catch {
      toast.error(t('customForms.actionFailed'));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Dialog
      open={formId !== null}
      onOpenChange={(open) => {
        if (!open && formId !== null) onDone(formId);
      }}
    >
      <DialogContent className="max-w-md" data-testid="choose-players-dialog">
        <DialogTitle>{t('customForms.choosePlayersTitle')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('customForms.choosePlayersTitle')}
        </DialogDescription>
        <ParticipantChecklist
          participants={participants}
          chosen={chosen}
          onChange={setChosen}
          idPrefix="choose-players"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => (formId === null ? undefined : onDone(formId))}
            data-testid="choose-players-later"
          >
            {t('customForms.choosePlayersLater')}
          </Button>
          <Button
            type="button"
            disabled={isBusy || chosen.length === 0}
            onClick={() => void save()}
            data-testid="choose-players-save"
          >
            {t('customForms.saveDraft')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
