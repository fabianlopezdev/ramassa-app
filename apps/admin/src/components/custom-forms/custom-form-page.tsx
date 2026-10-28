/**
 * One form the team created (RAPP-700, RAPP-701): its board of screens, its
 * settings and its responses, in tabs.
 *
 *   - Pantalles: Onboarding's own board (`FormBoard`), each card opening its
 *     screen in the shared screen editor, with the add card after the last.
 *   - Configuració: the name and the choices, saved as a draft (Desa
 *     l'esborrany), and the players it is for when the team picks them.
 *   - Respostes: who answered, who is pending and the deadline, each row
 *     opening her page.
 *
 * Every save is a draft: players see the version published last. Publica
 * makes the draft a version and asks its players; once a version exists it
 * asks Correcció or Nova versió (the shared Desa dialog), and a repeating
 * form is published to a season, the current one or a future one, as the
 * season authorization is. Arxiva takes it off every phone.
 */

import { choicesProblem, FormChoicesFields } from '@/components/custom-forms/form-choices';
import { EditorSection } from '@/components/layout/editor-section';
import { Page, PageHeader } from '@/components/layout/page';
import { AudiencePicker } from '@/components/notifications/audience-picker';
import { PhoneMiniature } from '@/components/onboarding/phone-preview';
import { useSaveKind } from '@/components/onboarding/save-kind-dialog';
import {
  AddScreenCard,
  FormBoard,
  lockedHide,
  useAddDependentScreen,
  type BoardCard,
  type NewScreenCondition,
} from '@/components/onboarding/screen-board';
import { conditionSources, type ConditionSource } from '@/components/onboarding/screen-condition';
import {
  conditionLine,
  placedPhoneQuestions,
  staffScreenContent,
} from '@/components/onboarding/screen-content';
import { teamHideLockKey } from '@/components/onboarding/screen-hiding';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CustomFormData } from '@/lib/custom-forms';
import { supabase } from '@/lib/supabase';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  archiveCustomForm,
  formFamily,
  formRootOf,
  formScreenParent,
  formScreensInOrder,
  publishCustomForm,
  reorderCustomFormScreens,
  saveCustomForm,
  saveCustomFormScreen,
  saveScreenCondition,
  setCustomFormRecipients,
  setScreenHidden,
  textIn,
  type CustomForm,
  type CustomFormChoices,
  type CustomFormRecipients,
  type CustomFormResponse,
  type CustomFormScreen,
} from '@ramassa/shared/intake-builder';
import {
  fetchCustomNotificationGroups,
  fetchNotificationAudienceOptions,
  type CustomNotificationGroup,
  type NotificationAudience,
  type NotificationAudienceOptions,
} from '@ramassa/shared/notifications';
import type { LanguageCode } from '@ramassa/shared/schemas';

/** Draft, live or archived, as a badge. */
export function FormStatusBadge({
  form,
}: {
  readonly form: Pick<CustomForm, 'isArchived' | 'publishedAt'>;
}) {
  const { t } = useTranslation('settings');
  const status = form.isArchived ? 'archived' : form.publishedAt === null ? 'draft' : 'live';
  return (
    <Badge variant={status === 'live' ? 'default' : 'outline'} className="shrink-0">
      {t(`customForms.status.${status}`)}
    </Badge>
  );
}

/** How many answered a form, for the Nova versió note; null when the reader cannot see them. */
function answeredCountOf(data: CustomFormData): number | null {
  return data.canReadResponses
    ? data.responses.filter((response) => response.status !== 'pending').length
    : null;
}

/** A screen of a form saves its draft at once: players see it with the next Publica. */
export const DRAFT_SAVE = {
  dialog: null,
  request: async (save: () => Promise<boolean>) => {
    await save();
  },
} as const;

export function CustomFormPage({
  data,
  formId,
}: {
  readonly data: CustomFormData;
  readonly formId: string;
}) {
  const { t, i18n } = useTranslation(['settings', 'nav']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const form = (data.intakeCatalog.customForms ?? []).find((each) => each.id === formId);
  const firstTab = data.canDesign ? 'screens' : 'responses';
  return (
    <Page data-testid="custom-form-page">
      <div className="flex flex-col gap-2">
        <Button asChild variant="ghost" size="sm" className="-ms-2.5 w-fit text-muted-foreground">
          <Link to="/forms/custom" data-testid="custom-form-back">
            <ChevronLeft aria-hidden data-icon="inline-start" className="rtl:rotate-180" />
            {t('nav:staff.customForms')}
          </Link>
        </Button>
        <PageHeader
          title={form === undefined ? t('customForms.notFound') : textIn(form.name, language)}
          description={
            form === undefined ? undefined : (
              <span className="flex flex-wrap items-center gap-2">
                <FormStatusBadge form={form} />
                {[
                  t(`customForms.level.${form.mandatory}`),
                  t(`customForms.audienceOption.${form.audience}`),
                  ...(form.repeatsEachSeason ? [t('customForms.repeatsYes')] : []),
                  ...(form.publishedAt === null
                    ? []
                    : [t('customForms.versionOf', { version: form.version })]),
                ].join(' · ')}
              </span>
            )
          }
          actions={form === undefined ? undefined : <FormActions data={data} form={form} />}
        />
      </div>
      {form === undefined ? null : (
        // Keyed by the form's version: a Publica starts from what the database holds.
        <Tabs key={`${form.id}-${form.version}`} defaultValue={firstTab} className="gap-6">
          <TabsList className="max-w-full overflow-x-auto" variant="line">
            {data.canDesign ? (
              <>
                <TabsTrigger value="screens">{t('customForms.tab.screens')}</TabsTrigger>
                <TabsTrigger value="settings">{t('customForms.tab.settings')}</TabsTrigger>
              </>
            ) : null}
            {data.canReadResponses ? (
              <TabsTrigger value="responses" data-testid="custom-form-responses-tab">
                {t('customForms.tab.responses')}
              </TabsTrigger>
            ) : null}
          </TabsList>
          {data.canDesign ? (
            <>
              <TabsContent value="screens">
                <FormScreensBoard data={data} form={form} />
              </TabsContent>
              <TabsContent value="settings" className="flex flex-col gap-6">
                <FormSettings form={form} />
                {form.audience === 'chosen' ? <FormRecipients form={form} /> : null}
              </TabsContent>
            </>
          ) : null}
          {data.canReadResponses ? (
            <TabsContent value="responses">
              <FormResponses form={form} responses={data.responses} />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </Page>
  );
}

function FormActions({ data, form }: { readonly data: CustomFormData; readonly form: CustomForm }) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const [isBusy, setIsBusy] = useState(false);
  // A repeating form is published to the current season or a future one.
  const current = data.seasons.find((season) => season.isCurrent);
  const targets = data.seasons.filter(
    (season) => season.isCurrent || current === undefined || season.startsOn > current.startsOn,
  );
  const [seasonId, setSeasonId] = useState<string | null>(current?.id ?? targets[0]?.id ?? null);
  const hasVersion = form.versions.some(
    (version) => !form.repeatsEachSeason || version.seasonId === seasonId,
  );
  const answered = answeredCountOf(data);
  const saveKind = useSaveKind({
    hasAnswers: hasVersion,
    newVersionNote: answered === null ? null : t('saveDialog.newVersionCount', { count: answered }),
  });

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
      await reload();
    } catch {
      toast.error(t('customForms.actionFailed'));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      {saveKind.dialog}
      {data.canDesign && form.repeatsEachSeason && !form.isArchived ? (
        <Select value={seasonId ?? ''} onValueChange={setSeasonId} disabled={targets.length === 0}>
          <SelectTrigger
            className="w-48"
            aria-label={t('customForms.publishSeason')}
            data-testid="custom-form-publish-season"
          >
            <SelectValue placeholder={t('customForms.publishSeason')} />
          </SelectTrigger>
          <SelectContent>
            {targets.map((season) => (
              <SelectItem key={season.id} value={season.id}>
                {season.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {data.canDesign && !form.isArchived ? (
        <Button
          type="button"
          disabled={isBusy || (form.repeatsEachSeason && seasonId === null)}
          onClick={() => {
            // A hidden screen is left out of the version (RAPP-711).
            if (form.screens.every((screen) => screen.isHidden === true)) {
              toast.error(t('customForms.needsScreen'));
              return;
            }
            void saveKind.request((kind) =>
              run(async () => {
                const count = await publishCustomForm(supabase, form.id, {
                  isCorrection: kind === 'correction',
                  seasonId: form.repeatsEachSeason ? seasonId : null,
                });
                toast.success(t('customForms.published', { count }));
              }),
            );
          }}
          data-testid="custom-form-publish"
        >
          {t('customForms.publish')}
        </Button>
      ) : null}
      {data.canDesign ? (
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={() => void run(() => archiveCustomForm(supabase, form.id, !form.isArchived))}
          data-testid="custom-form-archive"
        >
          {form.isArchived ? t('customForms.unarchive') : t('customForms.archive')}
        </Button>
      ) : null}
    </>
  );
}

// Pantalles ------------------------------------------------------------------------------------------

function FormScreensBoard({
  data,
  form,
}: {
  readonly data: CustomFormData;
  readonly form: CustomForm;
}) {
  const { t, i18n } = useTranslation(['settings', 'onboarding']);
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const catalog = data.intakeCatalog;
  // Her order: each screen that depends on an answer right after the screen asking it (RAPP-715).
  const ordered = formScreensInOrder(catalog, form);
  const roots = ordered.filter((screen) => formRootOf(catalog, form, screen.id) === screen.id);
  const byId = new Map(ordered.map((screen) => [screen.id, screen]));
  const sources = formConditionSources(catalog, form, language);
  const createScreen = useCreateFormScreen(form);
  const dependent = useAddDependentScreen({ catalog, sources, onCreate: createScreen });
  const hidingAncestor = (screen: CustomFormScreen): CustomFormScreen | null => {
    let parent = formScreenParent(catalog, form, screen);
    for (let depth = 0; parent !== null && depth < 64; depth += 1) {
      const above = byId.get(parent);
      if (above === undefined) return null;
      if (above.isHidden === true) return above;
      parent = formScreenParent(catalog, form, above);
    }
    return null;
  };
  const screenCard = (screen: CustomFormScreen, suffix?: string): BoardCard => {
    const ancestor = hidingAncestor(screen);
    const isHidden = screen.isHidden === true || ancestor !== null;
    const isOrphan =
      screen.showWhen !== undefined && formScreenParent(catalog, form, screen) === null;
    const lock = teamHideLockKey(catalog, 'custom_form', screen.id);
    return {
      key: screen.id,
      ...(suffix === undefined ? {} : { suffix }),
      name: textIn(screen.title, language),
      miniature: (
        <PhoneMiniature
          content={staffScreenContent(
            screen.title,
            screen.intro,
            placedPhoneQuestions(catalog, screen.id, language, null, 'custom_form'),
            language,
            t,
          )}
          language={language}
          isDimmed={isHidden || isOrphan}
        />
      ),
      status: isHidden
        ? t('builtinScreens.hiddenBadge')
        : isOrphan
          ? t('onboardingBoard.notShown')
          : null,
      ...(screen.showWhen === undefined
        ? {}
        : { note: conditionLine(catalog, screen.showWhen, language, t) }),
      // A draft like every change here: players see it with the next Publica (RAPP-701).
      hide:
        ancestor !== null
          ? {
              ...lockedHide(
                t('onboardingBoard.branchFollowsHidden', {
                  screen: textIn(ancestor.title, language),
                }),
              ),
              isHidden: true,
            }
          : {
              isHidden,
              canHide: lock === null || isHidden,
              reason: lock === null ? undefined : t(lock),
              toggle: async () => {
                await setScreenHidden(supabase, screen.id, !isHidden);
                await reload();
              },
            },
      addDependent: dependent.addFor(screen.id),
      link: {
        to: '/forms/custom/$formId/screens/$screenId',
        params: { formId: form.id, screenId: screen.id },
      },
    };
  };
  const cards: BoardCard[] = roots.map((root) => {
    // Every follow-up below it, depth first (RAPP-715): 3a, 3a.1, 3b.
    const branches = formFamily(catalog, form, root.id, '')
      .slice(1)
      .flatMap((member) => {
        const screen = byId.get(member.key);
        return screen === undefined ? [] : [screenCard(screen, member.number)];
      });
    return { ...screenCard(root), ...(branches.length === 0 ? {} : { branches }) };
  });
  return (
    <>
      <FormBoard
        // Keyed by the saved order: a reload starts again from what the database holds.
        key={ordered.map((screen) => screen.id).join('|')}
        label={textIn(form.name, language)}
        movable={cards}
        addCard={<AddScreenCard catalog={catalog} sources={sources} onCreate={createScreen} />}
        onReorder={async (keys) => {
          // Each screen goes with every follow-up below it (RAPP-715).
          await reorderCustomFormScreens(
            supabase,
            form.id,
            keys.flatMap((root) =>
              ordered
                .filter((screen) => formRootOf(catalog, form, screen.id) === root)
                .map((screen) => screen.id),
            ),
          );
          await reload();
        }}
      />
      {dependent.dialog}
    </>
  );
}

/** A form's screens that ask a choice question, in her order: what a screen can depend on (RAPP-715). */
export function formConditionSources(
  catalog: CustomFormData['intakeCatalog'],
  form: CustomForm,
  language: LanguageCode,
): readonly ConditionSource[] {
  const ordered = formScreensInOrder(catalog, form);
  const numbers = formBoardNumbers(catalog, form);
  return conditionSources(
    catalog,
    ordered.map((screen) => screen.id),
    'custom_form',
    (key) => ({
      name: textIn(ordered.find((screen) => screen.id === key)?.title ?? {}, language),
      number: numbers.get(key) ?? '',
      screenKey: key,
    }),
    language,
  );
}

/**
 * A new screen of a form, from "Afegeix una pantalla" on its board or a +
 * (RAPP-717): made from its Catalan name, with its condition when it depends
 * on an answer, then its editor opens.
 */
export function useCreateFormScreen(
  form: CustomForm,
): (name: string, depends: NewScreenCondition | null) => Promise<void> {
  const navigate = useNavigate();
  return async (name, depends) => {
    // The title is stored in Catalan, the language every other one falls back to.
    const id = await saveCustomFormScreen(supabase, {
      id: null,
      formId: form.id,
      title: { ca: name },
      intro: null,
    });
    // A follow-up (RAPP-715): the database puts it right after the screen asking it.
    if (depends !== null) await saveScreenCondition(supabase, id, depends.condition);
    await navigate({
      to: '/forms/custom/$formId/screens/$screenId',
      params: { formId: form.id, screenId: id },
    });
  };
}

/** The number each screen of a form carries on its board (RAPP-715): 3, 3a, 3a.1. */
export function formBoardNumbers(
  catalog: CustomFormData['intakeCatalog'],
  form: CustomForm,
): ReadonlyMap<string, string> {
  const ordered = formScreensInOrder(catalog, form);
  const numbers = new Map<string, string>();
  ordered
    .filter((screen) => formRootOf(catalog, form, screen.id) === screen.id)
    .forEach((root, index) => {
      for (const member of formFamily(catalog, form, root.id, String(index + 1))) {
        numbers.set(member.key, member.number);
      }
    });
  return numbers;
}

// Configuració ----------------------------------------------------------------------------------------

function FormSettings({ form }: { readonly form: CustomForm }) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const [choices, setChoices] = useState<CustomFormChoices>({
    name: form.name,
    filledBy: form.filledBy,
    mandatory: form.mandatory,
    deadline: form.deadline,
    audience: form.audience,
    repeatsEachSeason: form.repeatsEachSeason,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function saveDraft() {
    const problem = choicesProblem(choices);
    setError(problem === null ? null : t(problem));
    if (problem !== null) return;
    setIsSaving(true);
    try {
      await saveCustomForm(supabase, form.id, choices);
      await reload();
      toast.success(t('customForms.draftSaved'));
    } catch {
      toast.error(t('customForms.actionFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <EditorSection
      title={t('customForms.tab.settings')}
      testId="custom-form-settings"
      footer={
        <Button
          type="button"
          disabled={isSaving}
          onClick={() => void saveDraft()}
          data-testid="custom-form-settings-save"
        >
          {t('customForms.saveDraft')}
        </Button>
      }
    >
      <FormChoicesFields
        choices={choices}
        onChange={setChoices}
        error={error}
        hasLanguages
        isRepeatLocked={form.publishedAt !== null}
        idPrefix="form-settings"
      />
    </EditorSection>
  );
}

/** The players a form is for when the team picks them: one by one or by group. */
function FormRecipients({ form }: { readonly form: CustomForm }) {
  const { t } = useTranslation('settings');
  const reload = useReload();
  const [audience, setAudience] = useState<NotificationAudience | null>(null);
  const [players, setPlayers] = useState<readonly string[] | null>(null);
  const [groups, setGroups] = useState<readonly CustomNotificationGroup[]>([]);
  const [options, setOptions] = useState<NotificationAudienceOptions>({
    serviceCategories: [],
    events: [],
    entities: [],
    participants: [],
  });
  const [isBusy, setIsBusy] = useState(false);
  const picked: CustomFormRecipients | null =
    players !== null ? { kind: 'players', participantIds: players } : audience;

  // The same lists the notifications page picks from.
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchCustomNotificationGroups(supabase, controller.signal).catch(() => []),
      fetchNotificationAudienceOptions(supabase, controller.signal),
    ])
      .then(([loadedGroups, loadedOptions]) => {
        setGroups(loadedGroups);
        setOptions(loadedOptions);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function save() {
    if (picked === null) return;
    setIsBusy(true);
    try {
      const count = await setCustomFormRecipients(supabase, form.id, picked);
      toast.success(t('customForms.recipientsSaved', { count }));
      await reload();
    } catch {
      toast.error(t('customForms.actionFailed'));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <EditorSection
      title={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-start">
          <span className="text-base font-semibold">{t('customForms.recipients')}</span>
          <span className="text-sm text-muted-foreground">
            {t('customForms.recipientCount', { count: form.recipientCount ?? 0 })}
          </span>
        </span>
      }
      testId="custom-form-recipients"
      footer={
        <Button
          type="button"
          disabled={picked === null || isBusy}
          onClick={() => void save()}
          data-testid="custom-form-recipients-save"
        >
          {t('customForms.saveDraft')}
        </Button>
      }
    >
      <AudiencePicker
        idPrefix="custom-form-recipients"
        audience={audience}
        groups={groups}
        options={options}
        onChange={setAudience}
        players={{ chosen: players ?? [], onChange: setPlayers }}
      />
    </EditorSection>
  );
}

// Respostes -------------------------------------------------------------------------------------------

function FormResponses({
  form,
  responses,
}: {
  readonly form: CustomForm;
  readonly responses: readonly CustomFormResponse[];
}) {
  const { t, i18n } = useTranslation('settings');
  const locale = i18n.resolvedLanguage ?? 'ca';
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const done = responses.filter((response) => response.status === 'done').length;
  const pending = responses.filter((response) => response.status === 'pending').length;
  return (
    <EditorSection
      title={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-start">
          <span className="text-base font-semibold">{t('customForms.tab.responses')}</span>
          <span className="text-sm text-muted-foreground">
            {t('customForms.responsesSummary', { done, pending })}
          </span>
          {form.deadline === null ? null : (
            <span className="text-sm text-muted-foreground">
              {t('customForms.deadlineOn', { date: date.format(new Date(form.deadline)) })}
            </span>
          )}
        </span>
      }
      isFlush
      testId="custom-form-responses"
    >
      {responses.length === 0 ? (
        <p className="px-5 py-5 text-start text-sm text-muted-foreground">
          {t('customForms.noResponses')}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('customForms.column.player')}</TableHead>
              <TableHead>{t('customForms.column.status')}</TableHead>
              <TableHead>{t('customForms.column.asked')}</TableHead>
              <TableHead>{t('customForms.column.answered')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {responses.map((response) => (
              <TableRow key={response.responseId} data-testid={`response-${response.responseId}`}>
                <TableCell>
                  <Link
                    to="/participants/$participantId"
                    params={{ participantId: response.profileId }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {response.displayName ??
                      t('customForms.playerNumber', { number: response.memberNumber ?? '' })}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={response.status === 'pending' ? 'outline' : 'secondary'}>
                    {t(`customForms.response.${response.status}`)}
                  </Badge>
                  <span className="ms-2 text-xs text-muted-foreground">
                    {[
                      t('customForms.versionOf', { version: response.version }),
                      response.seasonName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </TableCell>
                <TableCell>{date.format(new Date(response.askedAt))}</TableCell>
                <TableCell>
                  {response.answeredAt === null
                    ? null
                    : [date.format(new Date(response.answeredAt)), response.answeredByName]
                        .filter(Boolean)
                        .join(' · ')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </EditorSection>
  );
}
