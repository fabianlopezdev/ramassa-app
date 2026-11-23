/**
 * Picking participants by name (RAPP-928): a search box over a list to tick,
 * with how many are picked. Typing filters by name, ignoring case and accents
 * (`filterNotificationGroupParticipants`); a click anywhere on a row ticks it.
 *
 * One list for every place the team picks people one by one: a custom
 * notification group's members, a form's players in Configuració, and the
 * players of a new form right after Crea.
 */
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  filterNotificationGroupParticipants,
  type NotificationAudienceOptions,
} from '@ramassa/shared/notifications';

export function ParticipantChecklist({
  participants,
  chosen,
  onChange,
  idPrefix,
  withLanguage = false,
  autoFocus = false,
}: {
  readonly participants: NotificationAudienceOptions['participants'];
  readonly chosen: readonly string[];
  readonly onChange: (chosen: readonly string[]) => void;
  /** Prefixes the ids and test ids: `<prefix>-search`, `<prefix>-member-<id>`, `<prefix>-empty`. */
  readonly idPrefix: string;
  /** Show each person's language after the name, as a notification group does. */
  readonly withLanguage?: boolean;
  readonly autoFocus?: boolean;
}) {
  const { t } = useTranslation('notifications');
  const [search, setSearch] = useState('');
  const visible = useMemo(
    () => filterNotificationGroupParticipants(participants, search),
    [participants, search],
  );
  const toggle = (id: string, isChosen: boolean) =>
    onChange(isChosen ? chosen.filter((each) => each !== id) : [...chosen, id]);
  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={`${idPrefix}-search`}
          name={`${idPrefix}-search`}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('groupSearch')}
          aria-label={t('groupSearch')}
          className="ps-9"
          autoFocus={autoFocus}
          data-testid={`${idPrefix}-search`}
        />
      </div>
      <fieldset
        // A fixed height: filtering never resizes the list or moves a dialog around it (RAPP-925).
        className="h-72 overflow-y-auto rounded-lg border p-1"
        data-testid={`${idPrefix}-list`}
      >
        <legend className="sr-only">{t('groupMembers')}</legend>
        {visible.map((participant) => {
          const isChosen = chosen.includes(participant.id);
          const id = `${idPrefix}-member-${participant.id}`;
          return (
            <label
              key={participant.id}
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-start text-sm hover:bg-muted"
            >
              <Checkbox
                id={id}
                checked={isChosen}
                onCheckedChange={() => toggle(participant.id, isChosen)}
                data-testid={id}
              />
              <span>
                {participant.fullName}
                {withLanguage ? ` (${participant.language})` : null}
              </span>
            </label>
          );
        })}
        {visible.length === 0 ? (
          <p
            data-testid={`${idPrefix}-empty`}
            className="px-2 py-2 text-start text-sm text-muted-foreground"
          >
            {t('groupEmpty')}
          </p>
        ) : null}
      </fieldset>
      <p className="text-start text-sm text-muted-foreground" aria-live="polite">
        {t('chosenCount', { count: chosen.length })}
      </p>
    </div>
  );
}
