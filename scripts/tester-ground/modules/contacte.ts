/**
 * Tester ground, Contacte tab (RAPP-885): for each tester a chat with the
 * equip tècnic, three mentoring requests and three suggestions.
 *
 * What she finds, and what counts on the tab (see `private.my_tab_news()` and
 * `public.get_unread_message_count()`):
 *   - Xat: ten messages over the last three weeks. She has read up to her own
 *     last message, so the two team messages at the end are unread (2).
 *   - Mentoria: one request scheduled by the team minutes ago (counts, "Nou"),
 *     one still waiting (`requested`) and one finished weeks ago (`completed`,
 *     already opened). The scheduled and the completed ones also show in the
 *     Activitats calendar, which reads the same requests; nothing else is needed.
 *   - Suggeriments: one resolved by the team minutes ago (counts, "Nou"), one
 *     waiting (`new`) and one resolved weeks ago that she has already opened.
 * So the Contacte tab shows 4: two messages, one request, one suggestion.
 *
 * The team rows that a player would never see are kept quiet: the push queue
 * entries that inserting team messages creates and the staff bell entries that
 * a new request, a new suggestion or her own messages create are deleted in the
 * same transaction, so nobody gets a push or a bell for dummy history. The
 * runner must run the whole SQL in one transaction for that.
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

type Sender = 'team' | 'her';

interface Message {
  readonly from: Sender;
  /** A SQL timestamp expression. */
  readonly at: string;
  readonly text: string;
}

const SHOE_SIZES = ['39', '38', '40', '37'] as const;

function chat(tester: Account, index: number): readonly Message[] {
  const size = SHOE_SIZES[index] ?? '39';
  return [
    {
      from: 'team',
      at: daysFromNow(-21, '10:15'),
      text: `Hola, ${tester.firstName}! Sóc la Júlia, de l'equip tècnic d'AE Ramassà. Per aquí ens pots escriure sempre que ho necessitis.`,
    },
    {
      from: 'her',
      at: daysFromNow(-21, '12:40'),
      text: "Hola, Júlia! Moltes gràcies. Dimarts vinc a l'entrenament per primera vegada.",
    },
    {
      from: 'team',
      at: daysFromNow(-21, '13:05'),
      text: "Genial! Entrenem de 18:30 a 20:00. Porta roba còmoda i una ampolla d'aigua.",
    },
    {
      from: 'her',
      at: daysFromNow(-14, '19:20'),
      text: 'Una pregunta: teniu botes per deixar? Les meves em van petites.',
    },
    {
      from: 'team',
      at: daysFromNow(-14, '20:02'),
      text: 'Sí, en tenim al material del club. Quin número calces?',
    },
    { from: 'her', at: daysFromNow(-14, '20:10'), text: `Un ${size}.` },
    {
      from: 'team',
      at: daysFromNow(-13, '09:30'),
      text: "Fet! Te les guardem per a l'entrenament de dijous.",
    },
    {
      from: 'her',
      at: daysFromNow(-6, '21:00'),
      text: 'Gràcies per les botes, em van molt bé. Ens veiem al proper entrenament!',
    },
    {
      from: 'team',
      at: minutesAgo(12),
      text: `Hola, ${tester.firstName}! Dissabte fem un partit amistós amb un altre equip del barri. T'hi apuntes?`,
    },
    {
      from: 'team',
      at: minutesAgo(11),
      text: 'Quedem a les 10:00 al camp. Si pots venir, respon-me per aquí i et comptem a la convocatòria.',
    },
  ];
}

/** Her own last message: she has read everything up to it. */
const LAST_READ = 7;

type Topic =
  'personal_development' | 'labor_orientation' | 'empowerment' | 'digital_skills' | 'other';

const TOPIC_DETAILS: Readonly<Record<Topic, string>> = {
  labor_orientation: "M'agradaria preparar el currículum i practicar una entrevista de feina.",
  digital_skills: 'Vull aprendre a fer servir el correu electrònic i a omplir formularis en línia.',
  personal_development:
    'Voldria parlar de com organitzar la setmana entre les classes de català i els entrenaments.',
  empowerment: "M'agradaria guanyar confiança per parlar davant del grup.",
  other: 'Voldria informació sobre cursos de cuina al barri.',
};

const SCHEDULED_TOPICS: readonly Topic[] = [
  'labor_orientation',
  'digital_skills',
  'personal_development',
  'empowerment',
];
const WAITING_TOPICS: readonly Topic[] = [
  'digital_skills',
  'other',
  'labor_orientation',
  'personal_development',
];
const DONE_TOPICS: readonly Topic[] = [
  'personal_development',
  'empowerment',
  'digital_skills',
  'labor_orientation',
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
const WAITING: readonly Suggestion[] = [
  {
    type: 'activity_proposal',
    text: "M'agradaria fer una sortida a la platja amb tot l'equip quan faci bon temps.",
  },
  {
    type: 'activity_proposal',
    text: 'Podríem anar a veure un partit de futbol femení totes juntes?',
  },
  {
    type: 'activity_proposal',
    text: 'Proposo un dinar de final de temporada on cadascuna porti un plat del seu país.',
  },
  { type: 'activity_proposal', text: "M'agradaria fer un taller de fotografia amb el mòbil." },
];
const ANSWERED_BEFORE: readonly Suggestion[] = [
  {
    type: 'general',
    text: 'Les samarretes de la primera equipació em van una mica grans. Hi ha talles més petites?',
  },
  { type: 'problem', text: 'Dimecres passat no hi havia llum al vestidor.' },
  { type: 'problem', text: "No trobava l'horari de la setmana a l'aplicació." },
  { type: 'general', text: "Faria falta una pilota més a l'entrenament dels dijous." },
];

// Ids ------------------------------------------------------------------------------------------

const conversationId = (t: Account) => uid(`contacte:conversation:${t.key}`);
const messageId = (t: Account, n: number) => uid(`contacte:message:${t.key}:${n}`);
const requestId = (t: Account, kind: 'scheduled' | 'waiting' | 'done') =>
  uid(`contacte:mentoring:${t.key}:${kind}`);
const eventId = (t: Account, kind: 'scheduled' | 'done') =>
  uid(`contacte:mentoring-event:${t.key}:${kind}`);
const suggestionId = (t: Account, kind: 'answered-now' | 'waiting' | 'answered-before') =>
  uid(`contacte:suggestion:${t.key}:${kind}`);

const testerIds = TESTERS.map((t) => uid(t.key)).join(', ');

function requestIds(t: Account): string {
  return [requestId(t, 'scheduled'), requestId(t, 'waiting'), requestId(t, 'done')].join(', ');
}
function suggestionIds(t: Account): string {
  return [
    suggestionId(t, 'answered-now'),
    suggestionId(t, 'waiting'),
    suggestionId(t, 'answered-before'),
  ].join(', ');
}
function messageIds(t: Account): string {
  return chat(t, 0)
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
 * The thread. `refresh` puts the dates and the text back on rows that exist,
 * so the two unread messages are minutes old again; an update fires no push.
 */
function chatSql(t: Account, index: number, refresh: boolean): string {
  const her = uid(t.key);
  const team = uid(TEAM.key);
  const rows = chat(t, index)
    .map(
      (m, n) =>
        `  (${messageId(t, n)}, ${ORG}, ${herConversation(t)}, ${m.from === 'team' ? team : her}, ${lit(m.text)}, ${m.at})`,
    )
    .join(',\n');
  const onConflict = refresh
    ? 'on conflict (id) do update set content = excluded.content, created_at = excluded.created_at'
    : 'on conflict (id) do nothing';
  const readConflict = refresh
    ? 'do update set last_read_message_id = excluded.last_read_message_id, read_at = excluded.read_at'
    : 'do nothing';
  return `
-- Contacte, ${t.key}: the chat with the equip tècnic.
insert into public.conversations (id, org_id, user_id, assigned_staff_id, created_at)
values (${conversationId(t)}, ${ORG}, ${her}, ${team}, ${daysFromNow(-21, '10:00')})
on conflict do nothing;

insert into public.messages (id, org_id, conversation_id, sender_id, content, created_at)
values
${rows}
${onConflict};

-- She has read up to her own last message; the team has read everything.
insert into public.conversation_read_states (org_id, conversation_id, user_id, last_read_message_id, read_at)
values
  (${ORG}, ${herConversation(t)}, ${her}, ${messageId(t, LAST_READ)}, ${daysFromNow(-6, '21:01')})
on conflict (conversation_id, user_id) ${readConflict};
insert into public.conversation_read_states (org_id, conversation_id, user_id, last_read_message_id, read_at)
values
  (${ORG}, ${herConversation(t)}, ${team}, ${messageId(t, chat(t, index).length - 1)}, ${minutesAgo(11)})
on conflict (conversation_id, user_id) do nothing;

-- No push and no bell for dummy history inserted in this transaction.
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
  const scheduledTopic = SCHEDULED_TOPICS[index] ?? 'labor_orientation';
  const waitingTopic = WAITING_TOPICS[index] ?? 'digital_skills';
  const doneTopic = DONE_TOPICS[index] ?? 'personal_development';
  const enc = (text: string) => `public.encrypt_field(${lit(text)})`;
  return `
-- Contacte, ${t.key}: mentoring. Scheduled minutes ago, waiting, and finished.
insert into public.mentoring_requests (
  id, org_id, player_id, topic, topic_detail_encrypted, preferred_date, preferred_time,
  status, scheduled_at, assigned_staff_id, staff_notes_encrypted, completed_at, created_at, updated_at
) values
  (${requestId(t, 'scheduled')}, ${ORG}, ${her}, ${lit(scheduledTopic)}, ${enc(TOPIC_DETAILS[scheduledTopic])},
   (${daysFromNow(4)})::date, '17:00', 'scheduled', ${daysFromNow(5, '17:30')}, ${team},
   ${enc("Ens trobem a la sala de reunions del camp abans de l'entrenament.")}, null,
   ${daysFromNow(-3, '11:20')}, ${minutesAgo(8)}),
  (${requestId(t, 'waiting')}, ${ORG}, ${her}, ${lit(waitingTopic)}, ${enc(TOPIC_DETAILS[waitingTopic])},
   (${daysFromNow(10)})::date, null, 'requested', null, null, null, null,
   ${daysFromNow(-8, '16:45')}, ${daysFromNow(-8, '16:45')}),
  (${requestId(t, 'done')}, ${ORG}, ${her}, ${lit(doneTopic)}, ${enc(TOPIC_DETAILS[doneTopic])},
   (${daysFromNow(-19)})::date, '17:00', 'completed', ${daysFromNow(-18, '17:30')}, ${team},
   null, ${daysFromNow(-18, '18:30')}, ${daysFromNow(-25, '10:10')}, ${daysFromNow(-18, '18:30')})
on conflict (id) do nothing;

-- The team's scheduling, as \`schedule_mentoring_request\` records it, without its push.
insert into public.mentoring_notification_events (id, org_id, request_id, recipient_id, kind, created_at)
values
  (${eventId(t, 'scheduled')}, ${ORG}, ${requestId(t, 'scheduled')}, ${her}, 'scheduled', ${minutesAgo(8)}),
  (${eventId(t, 'done')}, ${ORG}, ${requestId(t, 'done')}, ${her}, 'scheduled', ${daysFromNow(-24, '09:00')})
on conflict (id) do nothing;

-- She opened the finished request back then.
insert into public.mentoring_request_reads (org_id, request_id, user_id, seen_at)
values (${ORG}, ${requestId(t, 'done')}, ${her}, ${daysFromNow(-18, '20:00')})
on conflict (request_id, user_id) do nothing;

delete from public.staff_notifications
where event = 'mentoring_request' and source_id in (${requestIds(t)});
`;
}

// Suggestions ----------------------------------------------------------------------------------

function suggestionsSql(t: Account, index: number): string {
  const her = uid(t.key);
  const team = uid(TEAM.key);
  const now = ANSWERED_NOW[index] ?? ANSWERED_NOW[0]!;
  const waiting = WAITING[index] ?? WAITING[0]!;
  const before = ANSWERED_BEFORE[index] ?? ANSWERED_BEFORE[0]!;
  const enc = (text: string) => `public.encrypt_field(${lit(text)})`;
  return `
-- Contacte, ${t.key}: suggestions. Resolved minutes ago, waiting, resolved weeks ago.
insert into public.feedback_submissions (
  id, org_id, author_id, type, content_encrypted, status, resolved_by, resolved_at, created_at, updated_at
) values
  (${suggestionId(t, 'answered-now')}, ${ORG}, ${her}, ${lit(now.type)}, ${enc(now.text)},
   'resolved', ${team}, ${minutesAgo(6)}, ${daysFromNow(-6, '19:30')}, ${minutesAgo(6)}),
  (${suggestionId(t, 'waiting')}, ${ORG}, ${her}, ${lit(waiting.type)}, ${enc(waiting.text)},
   'new', null, null, ${daysFromNow(-1, '20:15')}, ${daysFromNow(-1, '20:15')}),
  (${suggestionId(t, 'answered-before')}, ${ORG}, ${her}, ${lit(before.type)}, ${enc(before.text)},
   'resolved', ${team}, ${daysFromNow(-20, '12:00')}, ${daysFromNow(-26, '18:40')}, ${daysFromNow(-20, '12:00')})
on conflict (id) do nothing;

-- She saw the old answer back then.
insert into public.feedback_submission_reads (org_id, submission_id, user_id, seen_at)
values (${ORG}, ${suggestionId(t, 'answered-before')}, ${her}, ${daysFromNow(-19, '09:00')})
on conflict (submission_id, user_id) do nothing;

delete from public.staff_notifications
where event = 'feedback' and source_id in (${suggestionIds(t)});
`;
}

// Removing -------------------------------------------------------------------------------------

/** The rows of one tester's requests and suggestions this module created. */
function deleteSeededSql(t: Account): string {
  return `
delete from public.mentoring_requests where id in (${requestIds(t)});
delete from public.feedback_submissions where id in (${suggestionIds(t)});
`;
}

const contacte: GroundModule = {
  name: 'contacte',
  order: 60,

  publish() {
    return [
      KEY_CHECK,
      ...TESTERS.map((t, i) => chatSql(t, i, false) + mentoringSql(t, i) + suggestionsSql(t, i)),
    ].join('\n');
  },

  /**
   * Everything of the four testers on this tab: the rows this module created
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
   * Back to how publish left her: the messages she sent are deleted, so the
   * thread ends again with the two unread team messages (dated minutes ago),
   * and her read state points at her own last message. The seeded requests and
   * suggestions are created again, so their changes are minutes old and the
   * finished ones are marked as opened. Requests and suggestions she made
   * herself stay until remove.
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
                     where conversation_id = ${herConversation(tester)} and sender_id = ${her}
                       and id not in (${messageIds(tester)}));
delete from public.messages
where conversation_id = ${herConversation(tester)} and sender_id = ${her}
  and id not in (${messageIds(tester)});
${deleteSeededSql(tester)}
${chatSql(tester, index, true)}
${mentoringSql(tester, index)}
${suggestionsSql(tester, index)}
`;
  },
};

export default contacte;
