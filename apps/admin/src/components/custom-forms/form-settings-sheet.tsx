/**
 * A form's Configuració (RAPP-919): a panel from the right, opened from the
 * form's header, so the board stays the page as it is on Onboarding.
 *
 * It holds the name and the choices (RAPP-701) and, when the team picks the
 * players itself, the players it is for. The app's legal forms change their
 * name only (RAPP-772, RAPP-773). One Desa l'esborrany saves it all: players
 * see it with the next Publica.
 */
import { choicesProblem, FormChoicesFields } from '@/components/custom-forms/form-choices';
import { AudiencePicker } from '@/components/notifications/audience-picker';
import { useReload } from '@/components/settings/onboarding-design-sections';
import { Button } from '@/components/ui/button';
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
  // The players are picked as soon as "A qui va dirigit" says the team picks them.
  const picksPlayers = choices.audience === 'chosen' && form.systemKey === null;
  const recipients: CustomFormRecipients | null =
    players !== null ? { kind: 'players', participantIds: players } : audience;

  // The same lists the notifications page picks from, once the panel needs them.
  useEffect(() => {
    if (!isOpen || !picksPlayers) return;
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
  }, [isOpen, picksPlayers]);

  // Each opening starts from what the database holds.
  function onOpenChange(next: boolean) {
    if (next) {
      setChoices(choicesOf(form));
      setError(null);
      setAudience(null);
      setPlayers(null);
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
      <SheetContent className="w-full gap-0 sm:max-w-lg" data-testid="custom-form-settings">
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
            isKindLocked={form.publishedAt !== null || form.systemKey !== null}
            // The app's legal forms are asked as they always were: only their name changes (RAPP-772, RAPP-773).
            isNameOnly={form.systemKey !== null}
            idPrefix="form-settings"
          />
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
