/**
 * A form's Configuració (RAPP-919): a panel from the right, opened from the
 * form's header, so the board stays the page as it is on Onboarding.
 *
 * It holds the name and the choices (RAPP-701) and, when the team picks the
 * players itself, the players it is for. Only the team's forms have it: the
 * app's legal forms have nothing to set (RAPP-927). One Desa l'esborrany saves
 * it all: players see it with the next Publica.
 */
import { choicesProblem, FormChoicesFields } from '@/components/custom-forms/form-choices';
import { AudiencePicker } from '@/components/notifications/audience-picker';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { supabase } from '@/lib/supabase';
import { Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  saveCustomForm,
  saveSurveySettings,
  setCustomFormRecipients,
  textIn,
  type CustomForm,
  type CustomFormChoices,
  type CustomFormRecipients,
} from '@ramassa/shared/intake-builder';
import {
  fetchCustomNotificationGroups,
  fetchNotificationAudienceOptions,
  type CustomNotificationGroup,
  type NotificationAudience,
  type NotificationAudienceOptions,
} from '@ramassa/shared/notifications';
import type { LanguageCode } from '@ramassa/shared/schemas';

function choicesOf(form: CustomForm): CustomFormChoices {
  return {
    kind: form.kind,
    name: form.name,
    filledBy: form.filledBy,
    mandatory: form.mandatory,
    deadline: form.deadline,
    audience: form.audience,
    repeatsEachSeason: form.repeatsEachSeason,
  };
}

/** A stored time as the value of a datetime-local input, in her clock; empty for none. */
function localDateTime(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const NO_OPTIONS: NotificationAudienceOptions = {
  serviceCategories: [],
  events: [],
  entities: [],
  participants: [],
};

export function FormSettingsSheet({ form }: { readonly form: CustomForm }) {
  const { t, i18n } = useTranslation('settings');
  const language = (i18n.resolvedLanguage ?? 'ca') as LanguageCode;
  const reload = useReload();
  const [isOpen, setIsOpen] = useState(false);
  const [choices, setChoices] = useState<CustomFormChoices>(() => choicesOf(form));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [audience, setAudience] = useState<NotificationAudience | null>(null);
  const [players, setPlayers] = useState<readonly string[] | null>(null);
  const [groups, setGroups] = useState<readonly CustomNotificationGroup[]>([]);
  const [options, setOptions] = useState<NotificationAudienceOptions>(NO_OPTIONS);
  // A survey's activity and closing time (RAPP-929).
  const isSurvey = form.kind === 'survey';
  const [eventId, setEventId] = useState<string>(form.eventId ?? '');
  const [closesAt, setClosesAt] = useState<string>(localDateTime(form.closesAt ?? null));
  // The players are picked as soon as "A qui va dirigit" says the team picks them.
  const picksPlayers = choices.audience === 'chosen';
  const recipients: CustomFormRecipients | null =
    players !== null ? { kind: 'players', participantIds: players } : audience;

  // The same lists the notifications page picks from, once the panel needs them.
  useEffect(() => {
    if (!isOpen || !(picksPlayers || isSurvey)) return;
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
  }, [isOpen, picksPlayers, isSurvey]);

  // Each opening starts from what the database holds.
  function onOpenChange(next: boolean) {
    if (next) {
      setChoices(choicesOf(form));
      setError(null);
      setAudience(null);
      setPlayers(null);
      setEventId(form.eventId ?? '');
      setClosesAt(localDateTime(form.closesAt ?? null));
    }
    setIsOpen(next);
  }

  async function saveDraft() {
    const problem = choicesProblem(choices);
    setError(problem === null ? null : t(problem));
    if (problem !== null) return;
    setIsSaving(true);
    try {
      await saveCustomForm(supabase, form.id, choices);
      if (isSurvey) {
        await saveSurveySettings(supabase, form.id, {
          eventId: eventId === '' ? null : eventId,
          closesAt: closesAt === '' ? null : new Date(closesAt).toISOString(),
        });
      }
      if (picksPlayers && recipients !== null) {
        const count = await setCustomFormRecipients(supabase, form.id, recipients);
        toast.success(t('customForms.recipientsSaved', { count }));
      } else {
        toast.success(t('customForms.draftSaved'));
      }
      await reload();
      setIsOpen(false);
    } catch {
      toast.error(t('customForms.actionFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" data-testid="custom-form-settings-open">
          <Settings aria-hidden data-icon="inline-start" />
          {t('customForms.tab.settings')}
        </Button>
      </SheetTrigger>
      {/* The board stays sharp behind the panel, so she sees the form she is setting up. */}
      <SheetContent
        className="w-full gap-0 sm:max-w-lg"
        overlayClassName="supports-backdrop-filter:backdrop-blur-none"
        data-testid="custom-form-settings"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{t('customForms.tab.settings')}</SheetTitle>
          <SheetDescription className="sr-only">{textIn(form.name, language)}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          <FormChoicesFields
            choices={choices}
            onChange={setChoices}
            error={error}
            hasLanguages
            isRepeatLocked={form.publishedAt !== null}
            isKindLocked={form.publishedAt !== null}
            isSurvey={isSurvey}
            idPrefix="form-settings"
          />
          {isSurvey ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="form-settings-event">{t('surveySettings.event')}</Label>
                <select
                  id="form-settings-event"
                  value={eventId}
                  onChange={(event) => setEventId(event.target.value)}
                  className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm"
                  data-testid="form-settings-event"
                >
                  <option value="">{t('surveySettings.noEvent')}</option>
                  {options.events.map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="form-settings-closes">{t('surveySettings.closesAt')}</Label>
                <Input
                  id="form-settings-closes"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(event) => setClosesAt(event.target.value)}
                  data-testid="form-settings-closes"
                />
              </div>
            </>
          ) : null}
          {picksPlayers ? (
            <section className="flex flex-col gap-3" data-testid="custom-form-recipients">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h3 className="text-start text-base font-semibold">
                  {t('customForms.recipients')}
                </h3>
                <span className="text-sm text-muted-foreground">
                  {t('customForms.recipientCount', { count: form.recipientCount ?? 0 })}
                </span>
              </div>
              <AudiencePicker
                idPrefix="custom-form-recipients"
                audience={audience}
                groups={groups}
                options={options}
                onChange={setAudience}
                players={{ chosen: players ?? [], onChange: setPlayers }}
              />
            </section>
          ) : null}
        </div>
        <SheetFooter className="border-t">
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => void saveDraft()}
            data-testid="custom-form-settings-save"
          >
            {t('customForms.saveDraft')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
