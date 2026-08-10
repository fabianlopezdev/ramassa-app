/**
 * The participant activity timeline (RAPP-24).
 *
 * It is empty today and it exists anyway, on purpose. Six later phases produce
 * activity about a participant (attendance, event signups, chat, forum posts,
 * feedback, equipment deliveries), and each one either appends a branch to
 * `public.participant_activity()` and a row shape this component already knows
 * how to render, or invents its own section on this page. Six sections that
 * each look slightly different is what a timeline defined late turns into.
 *
 * So the tabs are here now, each with a real empty state that says what will
 * fill it, rather than a single "coming soon" panel that teaches a staff member
 * nothing about where to look later.
 */

import { DetailSection } from '@/components/detail/detail-section';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  filterParticipantActivity,
  PARTICIPANT_ACTIVITY_KINDS,
  type ParticipantActivityEntry,
  type ParticipantActivityFilter,
} from '@ramassa/shared/participants';

export interface ParticipantActivityProps {
  readonly entries: readonly ParticipantActivityEntry[];
}

/**
 * The tab labels, keyed off the shared kind list so a source added there
 * arrives here as a missing translation key (loud) rather than as a silently
 * dropped tab (quiet).
 */
const ACTIVITY_LABEL_KEYS: Record<ParticipantActivityFilter, string> = {
  all: 'activityAll',
  attendance: 'activityAttendance',
  event_signup: 'activityEventSignup',
  message: 'activityMessage',
  forum_post: 'activityForumPost',
  feedback: 'activityFeedback',
  equipment: 'activityEquipment',
  service_interest: 'activityServiceInterest',
};

const ACTIVITY_FILTERS: readonly ParticipantActivityFilter[] = [
  'all',
  ...PARTICIPANT_ACTIVITY_KINDS,
];

export function ParticipantActivity({ entries }: ParticipantActivityProps) {
  const { t, i18n } = useTranslation('participants');
  const locale = i18n.resolvedLanguage ?? 'ca';
  const [filter, setFilter] = useState<ParticipantActivityFilter>('all');

  const shown = filterParticipantActivity(entries, filter);

  return (
    <DetailSection title={t('sectionActivity')} description={t('activityIntro')}>
      <Tabs
        value={filter}
        onValueChange={(next) => setFilter(next as ParticipantActivityFilter)}
        className="gap-4"
      >
        <TabsList variant="line" className="flex-wrap">
          {ACTIVITY_FILTERS.map((activityFilter) => (
            <TabsTrigger key={activityFilter} value={activityFilter}>
              {t(ACTIVITY_LABEL_KEYS[activityFilter])}
            </TabsTrigger>
          ))}
        </TabsList>

        {ACTIVITY_FILTERS.map((activityFilter) => (
          <TabsContent key={activityFilter} value={activityFilter}>
            {shown.length === 0 ? (
              <p className="text-start text-sm text-muted-foreground">{t('activityEmpty')}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {shown.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-0.5"
                    data-testid={`participant-activity-${entry.kind}-${entry.id}`}
                  >
                    <p className="text-start text-sm font-medium">{entry.title}</p>
                    <p className="text-start text-xs text-muted-foreground">
                      {t(ACTIVITY_LABEL_KEYS[entry.kind])}
                      {' · '}
                      {new Date(entry.occurred_at).toLocaleString(locale)}
                    </p>
                    {entry.detail === null ? null : (
                      <p className="text-start text-sm text-muted-foreground">{entry.detail}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </DetailSection>
  );
}
