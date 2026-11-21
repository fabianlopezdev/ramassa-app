/**
 * Tester ground, Contacte tab (RAPP-885): what waits for each tester in Xat,
 * Mentoria and Suggeriments.
 *
 * A tester starts from Onboarding, so she has no history: only what the equip
 * tècnic did for her shortly before she arrives.
 *   - Mentoria: one request the equip tècnic scheduled minutes ago (counts,
 *     "Nou").
 *   - Suggeriments: one suggestion the equip tècnic resolved minutes ago
 *     (counts, "Nou").
 *   - Xat: two messages from the equip tècnic, both unread. The database lets
 *     a chat exist only for a player (private.enforce_conversation_roles), so
 *     the chat is written once she has finished Onboarding: `seed` writes it
 *     for a tester who is already a player, and `renew <n>` writes it after she
 *     finished. A tester who has not finished Onboarding gets no chat.
 * So Contacte shows 2 before the chat exists and 4 with it (see
 * `private.my_tab_news()` and `public.get_unread_message_count()`).
 *
 * The rows a player would never see are kept quiet: the push queue entries
 * that inserting team messages creates and the staff bell entries that a new
 * request or suggestion creates are deleted in the same transaction, so nobody
 * gets a push or a bell for dummy data.
 *
 * Mentoring details and suggestions are stored encrypted with
 * `public.encrypt_field()`, which needs the vault secret `app_encryption_key`.
 */

import {
  daysFromNow,
  lit,
  minutesAgo,
  ORG,
  TEAM,
  TESTERS,
  uid,
  type Account,
  type GroundModule,
} from '../lib/ground';

interface Message {
  /** A SQL timestamp expression. */
  readonly at: string;
  readonly text: string;
}

/** Two messages from the equip tècnic, minutes before the run. */
function chat(tester: Account): readonly Message[] {
  return [
    {
      at: minutesAgo(12),
      text: `Hola, ${tester.firstName}! Sóc la Júlia, de l'equip tècnic d'AE Ramassà. Per aquí ens pots escriure sempre que ho necessitis.`,
    },
    {
      at: minutesAgo(11),
      text: "Dissabte fem un partit amistós amb un altre equip del barri. Quedem a les 10:00 al camp. T'hi apuntes? Respon-me per aquí i et comptem a la convocatòria.",
    },
  ];
}

type Topic = 'personal_development' | 'labor_orientation' | 'empowerment' | 'digital_skills';

const TOPIC_DETAILS: Readonly<Record<Topic, string>> = {
  labor_orientation: "M'agradaria preparar el currículum i practicar una entrevista de feina.",
  digital_skills: 'Vull aprendre a fer servir el correu electrònic i a omplir formularis en línia.',
  personal_development:
    'Voldria parlar de com organitzar la setmana entre les classes de català i els entrenaments.',
  empowerment: "M'agradaria guanyar confiança per parlar davant del grup.",
};

const SCHEDULED_TOPICS: readonly Topic[] = [
  'labor_orientation',
  'digital_skills',
  'personal_development',
  'empowerment',
];

type FeedbackType = 'activity_proposal' | 'idea' | 'problem' | 'general';

interface Suggestion {
  readonly type: FeedbackType;
  readonly text: string;
}

const ANSWERED_NOW: readonly Suggestion[] = [
  {
    type: 'idea',
    text: 'Proposo fer un entrenament obert perquè hi puguin venir amigues que encara no coneixen el Projecte.',
  },
  { type: 'idea', text: 'Podríem fer una llista compartida per portar fruita als entrenaments?' },
  { type: 'idea', text: "Estaria bé tenir l'horari dels entrenaments també en paper al vestidor." },
  { type: 'idea', text: 'Proposo fer una foto de grup amb totes les companyes a final de mes.' },
];

// Ids ------------------------------------------------------------------------------------------

const conversationId = (t: Account) => uid(`contacte:conversation:${t.key}`);
const messageId = (t: Account, n: number) => uid(`contacte:message:${t.key}:${n}`);
const requestId = (t: Account) => uid(`contacte:mentoring:${t.key}:scheduled`);
const eventId = (t: Account) => uid(`contacte:mentoring-event:${t.key}:scheduled`);
const suggestionId = (t: Account) => uid(`contacte:suggestion:${t.key}:answered-now`);

const testerIds = TESTERS.map((t) => uid(t.key)).join(', ');

function messageIds(t: Account): string {
  return chat(t)
    .map((_m, n) => messageId(t, n))
    .join(', ');
}

/** Her conversation, whether this module created it or she opened it first. */
function herConversation(t: Account): string {
  return `(select id from public.conversations where org_id = ${ORG} and user_id = ${uid(t.key)})`;
}

const KEY_CHECK = `
do $check$
begin
  if public.encryption_key() is null then
    raise exception 'contacte: the vault secret app_encryption_key is missing, so mentoring details and suggestions cannot be stored';
  end if;
end;
$check$;`;

// Chat -----------------------------------------------------------------------------------------

/**
 * The two team messages, for a tester who is a player. `refresh` dates them
 * minutes before the run again; an update fires no push. Her read state goes,
 * so both are unread.
 */
function chatSql(t: Account, refresh: boolean): string {
  const her = uid(t.key);
  const team = uid(TEAM.key);
  const rows = chat(t)
    .map((m, n) => `  (${messageId(t, n)}, ${team}, ${lit(m.text)}, ${m.at})`)
    .join(',\n');
  const onConflict = refresh
    ? 'on conflict (id) do update set content = excluded.content, created_at = excluded.created_at'
    : 'on conflict (id) do nothing';
  return `
-- Contacte, ${t.key}: the chat with the equip tècnic, once she is a player.
insert into public.conversations (id, org_id, user_id, assigned_staff_id, created_at)
select ${conversationId(t)}, ${ORG}, ${her}, ${team}, ${minutesAgo(13)}
 where exists (select 1 from public.profiles where id = ${her} and role = 'player')
on conflict do nothing;

insert into public.messages (id, org_id, conversation_id, sender_id, content, created_at)
select message.id, ${ORG}, conversation.id, message.sender_id, message.content, message.created_at
  from (values
${rows}
  ) as message(id, sender_id, content, created_at)
  join public.conversations as conversation on conversation.org_id = ${ORG} and conversation.user_id = ${her}
${onConflict};

delete from public.conversation_read_states
 where conversation_id = ${herConversation(t)} and user_id = ${her};
insert into public.conversation_read_states (org_id, conversation_id, user_id, last_read_message_id, read_at)
select ${ORG}, conversation.id, ${team}, ${messageId(t, chat(t).length - 1)}, ${minutesAgo(10)}
  from public.conversations as conversation
 where conversation.org_id = ${ORG} and conversation.user_id = ${her}
on conflict (conversation_id, user_id) do nothing;

-- No push and no bell for dummy data inserted in this transaction.
delete from public.push_publications
where content_type = 'message' and content_id in (${messageIds(t)});
delete from public.staff_notifications
where event = 'message' and source_id = ${herConversation(t)} and created_at >= now();
`;
}

// Mentoring ------------------------------------------------------------------------------------

function mentoringSql(t: Account, index: number): string {
  const her = uid(t.key);
  const team = uid(TEAM.key);
  const topic = SCHEDULED_TOPICS[index] ?? 'labor_orientation';
  const enc = (text: string) => `public.encrypt_field(${lit(text)})`;
  return `
-- Contacte, ${t.key}: one mentoring request, scheduled by the equip tècnic minutes ago.
insert into public.mentoring_requests (
  id, org_id, player_id, topic, topic_detail_encrypted, preferred_date, preferred_time,
  status, scheduled_at, assigned_staff_id, staff_notes_encrypted, completed_at, created_at, updated_at
) values
  (${requestId(t)}, ${ORG}, ${her}, ${lit(topic)}, ${enc(TOPIC_DETAILS[topic])},
   (${daysFromNow(4)})::date, '17:00', 'scheduled', ${daysFromNow(5, '17:30')}, ${team},
   ${enc("Ens trobem a la sala de reunions del camp abans de l'entrenament.")}, null,
   ${minutesAgo(90)}, ${minutesAgo(8)})
on conflict (id) do nothing;

-- The scheduling, as \`schedule_mentoring_request\` records it, without its push.
insert into public.mentoring_notification_events (id, org_id, request_id, recipient_id, kind, created_at)
values (${eventId(t)}, ${ORG}, ${requestId(t)}, ${her}, 'scheduled', ${minutesAgo(8)})
on conflict (id) do nothing;

delete from public.staff_notifications
where event = 'mentoring_request' and source_id = ${requestId(t)};
`;
}

// Suggestions ----------------------------------------------------------------------------------

function suggestionsSql(t: Account, index: number): string {
  const her = uid(t.key);
  const team = uid(TEAM.key);
  const answered = ANSWERED_NOW[index] ?? ANSWERED_NOW[0]!;
  return `
-- Contacte, ${t.key}: one suggestion, resolved by the equip tècnic minutes ago.
insert into public.feedback_submissions (
  id, org_id, author_id, type, content_encrypted, status, resolved_by, resolved_at, created_at, updated_at
) values
  (${suggestionId(t)}, ${ORG}, ${her}, ${lit(answered.type)}, public.encrypt_field(${lit(answered.text)}),
   'resolved', ${team}, ${minutesAgo(6)}, ${minutesAgo(100)}, ${minutesAgo(6)})
on conflict (id) do nothing;

delete from public.staff_notifications
where event = 'feedback' and source_id = ${suggestionId(t)};
`;
}

// Removing -------------------------------------------------------------------------------------

const contacte: GroundModule = {
  name: 'contacte',
  order: 60,

  publish() {
    return [
      KEY_CHECK,
      ...TESTERS.map((t, i) => chatSql(t, false) + mentoringSql(t, i) + suggestionsSql(t, i)),
    ].join('\n');
  },

  /**
   * Everything of the testers on this tab: the rows this module created
   * and whatever the testers or the team added while testing (her messages,
   * her own requests and suggestions, the team's replies, their push queue
   * entries and staff bell entries). Images attached to a suggestion stay in
   * storage.
   */
  remove() {
    const testerConversations = `(select id from public.conversations where user_id in (${testerIds}))`;
    const testerRequests = `(select id from public.mentoring_requests where player_id in (${testerIds}))`;
    return `
-- Contacte: remove.
delete from public.push_publications
where (content_type = 'message'
       and content_id in (select id from public.messages where conversation_id in ${testerConversations}))
   or (content_type = 'mentoring_update'
       and content_id in (select id from public.mentoring_notification_events where request_id in ${testerRequests}));

delete from public.staff_notifications
where (event = 'message' and source_id in ${testerConversations})
   or (event = 'mentoring_request' and source_id in ${testerRequests})
   or (event = 'feedback'
       and source_id in (select id from public.feedback_submissions where author_id in (${testerIds})));

delete from public.mentoring_requests where player_id in (${testerIds});
delete from public.feedback_submissions where author_id in (${testerIds});
delete from public.conversations where user_id in (${testerIds});
`;
  },

  /**
   * Back to how publish left her, with the chat once she is a player: the
   * messages she sent go, the two team messages are minutes old and unread
   * again, and the seeded request and suggestion are created again, so their
   * changes are minutes old. Requests and suggestions she made herself stay
   * until remove.
   */
  renew(tester) {
    const index = TESTERS.findIndex((t) => t.key === tester.key);
    const her = uid(tester.key);
    return `
${KEY_CHECK}
-- Contacte, renew ${tester.key}.
delete from public.push_publications
where content_type = 'message'
  and content_id in (select id from public.messages
                     where conversation_id = ${herConversation(tester)} and sender_id = ${her});
delete from public.messages
where conversation_id = ${herConversation(tester)} and sender_id = ${her};
delete from public.mentoring_requests where id = ${requestId(tester)};
delete from public.feedback_submissions where id = ${suggestionId(tester)};
${chatSql(tester, true)}
${mentoringSql(tester, index)}
${suggestionsSql(tester, index)}
`;
  },
};

export default contacte;
